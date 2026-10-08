import { describe, expect, it, vi } from "vitest";
import { createEventStreamParser, readEventStream } from "./readEventStream";
import type { EventStreamMessage } from "./readEventStream";

const encoder = new TextEncoder();

const streamOf = (chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });

const collect = async (stream: ReadableStream<Uint8Array>): Promise<EventStreamMessage[]> => {
  const events: EventStreamMessage[] = [];
  for await (const event of readEventStream(stream)) events.push(event);
  return events;
};

/** Feeds `text` to a fresh parser as two chunks, once for every possible cut point. */
const parseInEveryTwoChunkSplit = (text: string): EventStreamMessage[][] => {
  const results: EventStreamMessage[][] = [];
  for (let cut = 0; cut <= text.length; cut++) {
    const parser = createEventStreamParser();
    results.push([
      ...parser.feed(text.slice(0, cut)),
      ...parser.feed(text.slice(cut)),
      ...parser.end(),
    ]);
  }
  return results;
};

describe("createEventStreamParser", () => {
  it.each([
    ["CRLF", "\r\n"],
    ["LF", "\n"],
    ["CR", "\r"],
  ])("splits lines terminated by %s", (_name, eol) => {
    const parser = createEventStreamParser();
    const events = parser.feed(`event: chunk${eol}data: "a"${eol}${eol}data: b${eol}${eol}`);
    expect(events).toEqual([
      { event: "chunk", data: '"a"' },
      { event: "message", data: "b" },
    ]);
  });

  it("never leaves a carriage return in the data", () => {
    const parser = createEventStreamParser();
    const [event] = parser.feed('data: {"body": "x"}\r\n\r\n');
    expect(event?.data).toBe('{"body": "x"}');
    expect(() => JSON.parse(event?.data ?? "") as unknown).not.toThrow();
  });

  it("joins a CRLF split across two reads without emitting an extra blank line", () => {
    const parser = createEventStreamParser();
    expect(parser.feed("data: a\r")).toEqual([]);
    expect(parser.feed("\ndata: b\r")).toEqual([]);
    expect(parser.feed("\n\r")).toEqual([{ event: "message", data: "a\nb" }]);
    expect(parser.feed("\n")).toEqual([]);
    expect(parser.end()).toEqual([]);
  });

  it("parses the same events wherever a CRLF stream is cut", () => {
    const text = 'event: chunk\r\ndata: "x"\r\n\r\n: ping\r\n\r\nevent: done\r\ndata: {}\r\n\r\n';
    const expected = [
      { event: "chunk", data: '"x"' },
      { event: "done", data: "{}" },
    ];
    for (const result of parseInEveryTwoChunkSplit(text)) {
      expect(result).toEqual(expected);
    }
  });

  it("parses identically when fed one character at a time", () => {
    const text = "event: a\r\ndata: 1\r\ndata: 2\r\n\r\ndata: 3\r\r";
    const parser = createEventStreamParser();
    const characters = Array.from({ length: text.length }, (_, i) => text.charAt(i));
    const events = characters.flatMap((char) => parser.feed(char));
    expect([...events, ...parser.end()]).toEqual([
      { event: "a", data: "1\n2" },
      { event: "message", data: "3" },
    ]);
  });

  it("joins multiple data lines with a newline", () => {
    const parser = createEventStreamParser();
    expect(parser.feed("data: first\ndata:second\ndata\n\n")).toEqual([
      { event: "message", data: "first\nsecond\n" },
    ]);
  });

  it("strips exactly one leading space from a field value", () => {
    const parser = createEventStreamParser();
    expect(parser.feed("data:  two spaces\n\ndata:none\n\n")).toEqual([
      { event: "message", data: " two spaces" },
      { event: "message", data: "none" },
    ]);
  });

  it("keeps colons after the first one in the value", () => {
    const parser = createEventStreamParser();
    expect(parser.feed('data: {"a": "b:c"}\n\n')).toEqual([
      { event: "message", data: '{"a": "b:c"}' },
    ]);
  });

  it("ignores comment lines, including keep-alive pings", () => {
    const parser = createEventStreamParser();
    expect(parser.feed(": ping\r\n\r\n:\r\ndata: x\r\n: inside\r\n\r\n")).toEqual([
      { event: "message", data: "x" },
    ]);
  });

  it("drops an event with no data field and resets its type", () => {
    const parser = createEventStreamParser();
    expect(parser.feed("event: lonely\n\ndata: next\n\n")).toEqual([
      { event: "message", data: "next" },
    ]);
  });

  it("dispatches an event whose only data line is empty", () => {
    const parser = createEventStreamParser();
    expect(parser.feed("event: done\ndata:\n\n")).toEqual([{ event: "done", data: "" }]);
  });

  it("uses the last event field of an event", () => {
    const parser = createEventStreamParser();
    expect(parser.feed("event: a\nevent: b\ndata: x\n\n")).toEqual([{ event: "b", data: "x" }]);
  });

  it("ignores id, retry and unknown fields", () => {
    const parser = createEventStreamParser();
    expect(parser.feed("id: 7\nretry: 1000\nfoo: bar\ndata: x\n\n")).toEqual([
      { event: "message", data: "x" },
    ]);
  });

  it("flushes the pending event at the end of input", () => {
    const parser = createEventStreamParser();
    expect(parser.feed('event: done\r\ndata: {"ok": true}')).toEqual([]);
    expect(parser.end()).toEqual([{ event: "done", data: '{"ok": true}' }]);
  });

  it("emits nothing at the end of input when no event is pending", () => {
    const parser = createEventStreamParser();
    parser.feed("data: x\n\n: trailing comment");
    expect(parser.end()).toEqual([]);
  });
});

describe("readEventStream", () => {
  it("yields events from a byte stream", async () => {
    const events = await collect(
      streamOf([
        'event: chunk\r\ndata: "[{"\r\n\r\n',
        'event: done\r\ndata: {"comments": 1}\r\n\r\n',
      ])
    );
    expect(events).toEqual([
      { event: "chunk", data: '"[{"' },
      { event: "done", data: '{"comments": 1}' },
    ]);
  });

  it("keeps a multi-byte character split across reads intact", async () => {
    const bytes = encoder.encode("data: привет 👋\r\n\r\n");
    // Cut inside the four-byte emoji and inside a two-byte Cyrillic letter.
    const emojiStart = bytes.indexOf(0xf0);
    const events = await collect(
      streamOf([
        bytes.slice(0, 7),
        bytes.slice(7, emojiStart + 2),
        bytes.slice(emojiStart + 2, emojiStart + 3),
        bytes.slice(emojiStart + 3),
      ])
    );
    expect(events).toEqual([{ event: "message", data: "привет 👋" }]);
  });

  it("drops a leading byte order mark", async () => {
    const events = await collect(streamOf(["\uFEFFdata: x\n\n"]));
    expect(events).toEqual([{ event: "message", data: "x" }]);
  });

  it("flushes the last event when the stream closes without a blank line", async () => {
    const events = await collect(streamOf(['event: done\r\ndata: {"comments": 2}\r\n']));
    expect(events).toEqual([{ event: "done", data: '{"comments": 2}' }]);
  });

  it("cancels the stream when the consumer stops early", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: first\n\ndata: second\n\n"));
      },
      cancel,
    });

    for await (const event of readEventStream(stream)) {
      expect(event.data).toBe("first");
      break;
    }

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("propagates a read error", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: partial\n\n"));
        controller.error(new DOMException("The operation was aborted.", "AbortError"));
      },
    });

    await expect(collect(stream)).rejects.toMatchObject({ name: "AbortError" });
  });
});
