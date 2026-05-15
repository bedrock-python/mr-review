# API Integration

Best practices for API communication using Axios, Zod validation, and error handling.

## HTTP Client Setup

### Base Client (shared/api/http-client.ts)

```typescript
import axios, type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from "axios";
import { env } from "@shared/config/env";

class HttpClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.VITE_API_BASE_URL,
      timeout: 30000,
      withCredentials: true,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      this.handleRequest,
      this.handleRequestError
    );

    this.client.interceptors.response.use(
      this.handleResponse,
      this.handleResponseError
    );
  }

  private handleRequest = (config: InternalAxiosRequestConfig) => {
    // Add request ID for tracing
    config.headers["X-Request-ID"] = crypto.randomUUID();
    return config;
  };

  private handleRequestError = (error: unknown) => {
    return Promise.reject(error);
  };

  private handleResponse = (response: AxiosResponse) => {
    return response;
  };

  private handleResponseError = async (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      // Handle token refresh
      try {
        await this.refreshToken();
        // Retry original request
        return this.client.request(error.config!);
      } catch (refreshError) {
        // Redirect to login
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  };

  private async refreshToken(): Promise<void> {
    await this.client.post("/auth/refresh");
  }

  public get instance(): AxiosInstance {
    return this.client;
  }
}

export const httpClient = new HttpClient().instance;
```

## Zod Validation

**ALL API responses MUST be validated with Zod**

### Schema Definition

```typescript
// entities/user/api/schemas.ts
import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "user", "guest"]),
  createdAt: z.string().datetime(),
});

export const UsersResponseSchema = z.object({
  users: z.array(UserSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

export type User = z.infer<typeof UserSchema>;
export type UsersResponse = z.infer<typeof UsersResponseSchema>;
```

### API Functions with Validation

```typescript
// entities/user/api/userApi.ts
import type { AxiosResponse } from "axios";

export const userApi = {
  getUser: async (id: string): Promise<User> => {
    const response: AxiosResponse<unknown> = await httpClient.get(`/users/${id}`);
    return UserSchema.parse(response.data);
  },

  getUsers: async (params: GetUsersParams): Promise<UsersResponse> => {
    const response: AxiosResponse<unknown> = await httpClient.get("/users", { params });
    return UsersResponseSchema.parse(response.data);
  },

  createUser: async (data: CreateUserInput): Promise<User> => {
    const response: AxiosResponse<unknown> = await httpClient.post("/users", data);
    return UserSchema.parse(response.data);
  },
};
```

### Why Zod Validation?

1. **Runtime Safety**: TypeScript only checks at compile time
2. **Data Transformation**: Auto-parse dates, numbers, etc.
3. **Error Messages**: Clear validation errors
4. **Documentation**: Schema is self-documenting

## Error Handling

### Error Types

```typescript
// shared/api/errors.ts
import { z } from "zod";

export const ApiErrorSchema = z.object({
  message: z.string(),
  code: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public fieldErrors: Record<string, string[]>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}
```

### Error Handling in Components

```typescript
// ✅ CORRECT - Comprehensive error handling
export const UserProfile = ({ userId }: UserProfileProps) => {
  const { data: user, error, isError, refetch } = useUser(userId);

  if (isError) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        return <NotFound message="User not found" />;
      }
      if (error.response?.status === 403) {
        return <Forbidden message="Access denied" />;
      }
      if (error.code === "ECONNABORTED") {
        return <Error message="Request timeout" onRetry={refetch} />;
      }
    }

    if (error instanceof z.ZodError) {
      return <Error message="Invalid data format" onRetry={refetch} />;
    }

    return <Error message="Something went wrong" onRetry={refetch} />;
  }

  if (!user) return <Spinner />;

  return <div>{user.name}</div>;
};
```

## Retry Logic

### Automatic Retry

```typescript
// ✅ CORRECT - TanStack Query retry
export const useUser = (id: string) => {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => userApi.getUser(id),
    retry: (failureCount, error) => {
      // Don't retry on 4xx errors
      if (axios.isAxiosError(error) && error.response?.status && error.response.status < 500) {
        return false;
      }
      // Retry up to 3 times for 5xx errors
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};
```

## Request Cancellation

```typescript
// ✅ CORRECT - Cancel on unmount
export const useSearchUsers = (query: string) => {
  return useQuery({
    queryKey: ["users", "search", query],
    queryFn: ({ signal }) => {
      return httpClient.get("/users/search", {
        params: { q: query },
        signal, // Pass signal for cancellation
      });
    },
    enabled: query.length > 2,
  });
};
```

## Auth Token Management

### Refresh Token Flow

```typescript
// shared/api/interceptors/auth.ts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });

  failedQueue = [];
};

export const setupAuthInterceptor = (client: AxiosInstance) => {
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          // Wait for refresh to complete
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then(() => client(originalRequest))
            .catch((err) => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          await client.post("/auth/refresh");
          processQueue(null);
          return client(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError as Error);
          // Redirect to login
          window.location.href = "/login";
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      return Promise.reject(error);
    }
  );
};
```

## Request/Response Types

### Generic Response Type

```typescript
// shared/api/types.ts
export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type ApiErrorResponse = {
  message: string;
  code: string;
  details?: Record<string, unknown>;
};
```

### Type-safe API Client

```typescript
// shared/api/createApiClient.ts
export const createApiClient = <TResponse, TError = ApiErrorResponse>() => {
  return {
    get: async <TData = TResponse>(
      url: string,
      config?: AxiosRequestConfig
    ): Promise<TData> => {
      const response = await httpClient.get<TData>(url, config);
      return response.data;
    },

    post: async <TData = TResponse>(
      url: string,
      data?: unknown,
      config?: AxiosRequestConfig
    ): Promise<TData> => {
      const response = await httpClient.post<TData>(url, data, config);
      return response.data;
    },

    // ... put, patch, delete
  };
};
```

## Best Practices Summary

1. ✅ **Always use Zod validation** for API responses
2. ✅ **Centralize HTTP client** in shared/api/
3. ✅ **Handle errors comprehensively** with specific error types
4. ✅ **Implement retry logic** for transient failures
5. ✅ **Auto-refresh tokens** on 401 errors
6. ✅ **Cancel requests** on component unmount
7. ✅ **Type all API calls** with Zod-inferred types
8. ✅ **Use TanStack Query** for all server state
9. ✅ **Log errors** for debugging
10. ✅ **Show user-friendly error messages**

## Anti-Patterns (Avoid)

### ❌ WRONG: No validation

```typescript
// ❌ WRONG
const response = await httpClient.get("/users/1");
const user = response.data; // No validation!
```

### ❌ WRONG: Inline error handling

```typescript
// ❌ WRONG
try {
  const user = await fetchUser(id);
} catch (error) {
  console.log(error); // No proper error handling
}
```

### ❌ WRONG: Manual token refresh

```typescript
// ❌ WRONG - Don't manually check/refresh tokens
if (isTokenExpired()) {
  await refreshToken();
}
const data = await fetchData();
```
