/**
 * Server-Sent Events (text/event-stream) parsing per the WHATWG HTML spec,
 * section 9.2.6 "Interpreting an event stream":
 * https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 *
 * `EventSource` cannot send a POST body, so streaming endpoints that need one are
 * read with `fetch` and parsed here instead.
 */

const LF = 0x0a;
const CR = 0x0d;

const DEFAULT_EVENT_TYPE = "message";

export type EventStreamMessage = {
  /** Value of the event's last `event:` field, or "message" when it had none. */
  event: string;
  /** The event's `data:` lines joined with "\n". */
  data: string;
};

export type EventStreamParser = {
  /** Feeds the next piece of decoded text; returns the events it completed. */
  feed: (text: string) => EventStreamMessage[];
  /** Signals the end of the stream; returns the event still pending, if any. */
  end: () => EventStreamMessage[];
};

export const createEventStreamParser = (): EventStreamParser => {
  // Text after the last line terminator — an incomplete line waiting for more input.
  let buffer = "";
  // A chunk ended with CR: a LF opening the next chunk belongs to the same CRLF.
  let isAfterTrailingCr = false;
  let eventType = "";
  let dataLines: string[] = [];

  const dispatch = (out: EventStreamMessage[]): void => {
    // An event without a single `data:` field is dropped, and its type is reset with it.
    if (dataLines.length > 0) {
      out.push({ event: eventType || DEFAULT_EVENT_TYPE, data: dataLines.join("\n") });
    }
    eventType = "";
    dataLines = [];
  };

  const processLine = (line: string, out: EventStreamMessage[]): void => {
    if (line === "") {
      dispatch(out);
      return;
    }
    if (line.startsWith(":")) return;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") eventType = value;
    else if (field === "data") dataLines.push(value);
    // `id` and `retry` only matter for reconnection, which a fetch-based reader
    // does not do; unknown fields are ignored by the spec.
  };

  const feed = (text: string): EventStreamMessage[] => {
    const out: EventStreamMessage[] = [];
    // The buffered prefix holds no terminators, so scanning resumes after it and a
    // long line delivered in many small chunks stays linear.
    let scanFrom = buffer.length;
    buffer += text;
    let lineStart = 0;

    if (isAfterTrailingCr && buffer.length > 0) {
      isAfterTrailingCr = false;
      if (buffer.charCodeAt(0) === LF) {
        lineStart = 1;
        scanFrom = 1;
      }
    }

    for (let i = scanFrom; i < buffer.length; i++) {
      const code = buffer.charCodeAt(i);
      if (code !== LF && code !== CR) continue;

      processLine(buffer.slice(lineStart, i), out);
      if (code === CR) {
        if (i + 1 < buffer.length) {
          if (buffer.charCodeAt(i + 1) === LF) i++;
        } else {
          isAfterTrailingCr = true;
        }
      }
      lineStart = i + 1;
    }

    buffer = buffer.slice(lineStart);
    return out;
  };

  const end = (): EventStreamMessage[] => {
    const out: EventStreamMessage[] = [];
    if (buffer !== "") processLine(buffer, out);
    buffer = "";
    isAfterTrailingCr = false;
    // The spec discards an event that is not followed by a blank line before EOF.
    // We dispatch it instead: a server that closes right after its last `data:` line
    // must not lose the final (usually terminal) event.
    dispatch(out);
    return out;
  };

  return { feed, end };
};

/**
 * Reads a `text/event-stream` body and yields its events in order.
 *
 * UTF-8 is decoded in streaming mode, so a multi-byte character split across reads
 * survives, and a leading BOM is dropped. When the consumer stops iterating early,
 * the underlying stream is cancelled so the connection is released.
 */
export async function* readEventStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<EventStreamMessage, void, undefined> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  const parser = createEventStreamParser();
  let isDrained = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield* parser.feed(decoder.decode(value, { stream: true }));
    }
    isDrained = true;
    yield* parser.feed(decoder.decode());
    yield* parser.end();
  } finally {
    if (!isDrained) {
      // The consumer returned early or the read failed — either way nobody will
      // read the rest, so abort the transfer. A rejection here only repeats the
      // read error that is already propagating.
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}
