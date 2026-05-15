# React Component Patterns

Advanced React patterns for building maintainable components.

## Composition Over Inheritance

**ALWAYS use composition, NEVER inheritance**

```typescript
// ✅ CORRECT - Composition
export const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="card">{children}</div>
);

export const UserCard = ({ user }: { user: User }) => (
  <Card>
    <h3>{user.name}</h3>
    <p>{user.email}</p>
  </Card>
);

// ❌ WRONG - Inheritance
class Card extends React.Component { ... }
class UserCard extends Card { ... }
```

## Compound Components

**For complex components with multiple sub-components**

```typescript
// ✅ CORRECT - Compound component pattern
export type TabsProps = {
  defaultValue: string;
  children: React.ReactNode;
};

export const Tabs = ({ defaultValue, children }: TabsProps) => {
  const [activeTab, setActiveTab] = useState(defaultValue);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabsContext.Provider>
  );
};

Tabs.List = TabsList;
Tabs.Trigger = TabsTrigger;
Tabs.Content = TabsContent;

// Usage
<Tabs defaultValue="tab1">
  <Tabs.List>
    <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
    <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="tab1">Content 1</Tabs.Content>
  <Tabs.Content value="tab2">Content 2</Tabs.Content>
</Tabs>
```

## Render Props

**When you need to share logic with render flexibility**

```typescript
// ✅ CORRECT - Render props
export type DataFetcherProps<T> = {
  url: string;
  children: (data: T | null, isLoading: boolean, error: Error | null) => React.ReactNode;
};

export const DataFetcher = <T,>({ url, children }: DataFetcherProps<T>) => {
  const { data, isLoading, error } = useQuery({ queryKey: [url], queryFn: () => fetch(url) });

  return <>{children(data, isLoading, error)}</>;
};

// Usage
<DataFetcher<User> url="/api/users/1">
  {(user, isLoading, error) => {
    if (isLoading) return <Spinner />;
    if (error) return <Error message={error.message} />;
    return <UserCard user={user} />;
  }}
</DataFetcher>
```

## Custom Hooks Pattern

**Prefer custom hooks over render props for logic reuse**

```typescript
// ✅ CORRECT - Custom hook (preferred)
export const useUser = (userId: string) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => fetchUser(userId),
  });

  return { user: data, isLoading, error };
};

// Usage
export const UserProfile = ({ userId }: UserProfileProps) => {
  const { user, isLoading, error } = useUser(userId);

  if (isLoading) return <Spinner />;
  if (error) return <Error message={error.message} />;
  return <div>{user.name}</div>;
};
```

## Children Patterns

### Children as Content

```typescript
// ✅ CORRECT - Simple content children
export type CardProps = {
  children: React.ReactNode;
};

export const Card = ({ children }: CardProps) => (
  <div className="card">{children}</div>
);
```

### Children as Function

```typescript
// ✅ CORRECT - Function as children
export type ListProps<T> = {
  items: T[];
  children: (item: T, index: number) => React.ReactNode;
};

export const List = <T,>({ items, children }: ListProps<T>) => (
  <ul>
    {items.map((item, index) => (
      <li key={index}>{children(item, index)}</li>
    ))}
  </ul>
);

// Usage
<List items={users}>
  {(user, index) => <UserCard key={user.id} user={user} />}
</List>
```

## Ref Forwarding

**For components that need DOM access**

```typescript
// ✅ CORRECT - forwardRef
export type InputProps = {
  placeholder?: string;
} & React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ placeholder, ...props }, ref) => {
    return <input ref={ref} placeholder={placeholder} {...props} />;
  }
);

Input.displayName = "Input";

// Usage
const MyForm = () => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    inputRef.current?.focus();
  };

  return <Input ref={inputRef} />;
};
```

## Controlled vs Uncontrolled

### Controlled Components

**Use when parent needs to control state**

```typescript
// ✅ CORRECT - Controlled
export type ControlledInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export const ControlledInput = ({ value, onChange }: ControlledInputProps) => (
  <input value={value} onChange={(e) => onChange(e.target.value)} />
);

// Usage
const Form = () => {
  const [name, setName] = useState("");
  return <ControlledInput value={name} onChange={setName} />;
};
```

### Uncontrolled Components

**Use for simple cases without parent control**

```typescript
// ✅ CORRECT - Uncontrolled with ref
export const UncontrolledInput = () => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    console.log(inputRef.current?.value);
  };

  return <input ref={inputRef} defaultValue="" />;
};
```

## Error Boundaries

**Catch errors in component tree**

```typescript
// ✅ CORRECT - Error boundary
import { ErrorBoundary as ReactErrorBoundary } from "react-error-boundary";

export const ErrorFallback = ({ error, resetErrorBoundary }: ErrorFallbackProps) => (
  <div role="alert">
    <h2>Something went wrong</h2>
    <pre>{error.message}</pre>
    <button onClick={resetErrorBoundary}>Try again</button>
  </div>
);

// Usage
export const App = () => (
  <ReactErrorBoundary FallbackComponent={ErrorFallback}>
    <Routes />
  </ReactErrorBoundary>
);
```

## Conditional Rendering

### Simple Conditionals

```typescript
// ✅ CORRECT - Ternary for simple cases
{isLoading ? <Spinner /> : <Content />}

// ✅ CORRECT - && for showing/hiding
{hasError && <ErrorMessage />}

// ❌ WRONG - nested ternaries
{isLoading ? <Spinner /> : hasError ? <Error /> : <Content />}

// ✅ CORRECT - early returns for complex logic
if (isLoading) return <Spinner />;
if (hasError) return <ErrorMessage />;
return <Content />;
```

### Multiple Conditions

```typescript
// ✅ CORRECT - Object map pattern
const STATUS_COMPONENTS = {
  loading: <Spinner />,
  error: <ErrorMessage />,
  success: <Content />,
  empty: <EmptyState />,
} as const;

export const DataDisplay = ({ status }: { status: keyof typeof STATUS_COMPONENTS }) => {
  return STATUS_COMPONENTS[status];
};
```

## Performance Patterns

### Memoization

```typescript
// ✅ CORRECT - Memo for expensive components
export const ExpensiveList = memo(({ items }: { items: Item[] }) => {
  return <ul>{items.map(renderItem)}</ul>;
});

// ✅ CORRECT - useMemo for expensive calculations
export const Chart = ({ data }: { data: number[] }) => {
  const chartData = useMemo(() => processChartData(data), [data]);
  return <ChartComponent data={chartData} />;
};

// ✅ CORRECT - useCallback for stable callbacks
export const Parent = () => {
  const handleClick = useCallback((id: string) => {
    console.log(id);
  }, []);

  return <Child onClick={handleClick} />;
};
```

### Lazy Loading

```typescript
// ✅ CORRECT - Lazy load routes
const HomePage = lazy(() => import("@pages/home"));
const LoginPage = lazy(() => import("@pages/login"));

export const Routes = () => (
  <Suspense fallback={<Spinner />}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  </Suspense>
);
```

## Component Organization

### File Structure

```typescript
// UserCard/UserCard.tsx
export const UserCard = ({ user }: UserCardProps) => { ... };

// UserCard/types.ts
export type UserCardProps = { ... };

// UserCard/constants.ts
export const DEFAULT_AVATAR = "/default-avatar.png";

// UserCard/utils.ts
export const formatUserName = (user: User) => { ... };

// UserCard/index.ts
export { UserCard } from "./UserCard";
export type { UserCardProps } from "./types";
```

### Component Size

- **Max 200 lines** per component file
- If longer, split into sub-components
- Extract hooks to separate files
- Move utils to separate files

## Accessibility Patterns

```typescript
// ✅ CORRECT - Semantic HTML + ARIA
export const Button = ({ children, onClick, disabled }: ButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-disabled={disabled}
  >
    {children}
  </button>
);

// ✅ CORRECT - Form labels
export const FormField = ({ label, id, ...props }: FormFieldProps) => (
  <div>
    <label htmlFor={id}>{label}</label>
    <input id={id} {...props} />
  </div>
);
```

## Anti-Patterns (Avoid)

### ❌ Prop Drilling

```typescript
// ❌ WRONG - Prop drilling
<GrandParent user={user}>
  <Parent user={user}>
    <Child user={user} />
  </Parent>
</GrandParent>

// ✅ CORRECT - Context or state management
const UserContext = createContext<User | null>(null);

<UserContext.Provider value={user}>
  <GrandParent>
    <Parent>
      <Child />
    </Parent>
  </GrandParent>
</UserContext.Provider>
```

### ❌ Inline Object/Array Creation

```typescript
// ❌ WRONG - Creates new reference on every render
<Component data={{ id: 1, name: "John" }} />
<Component items={[1, 2, 3]} />

// ✅ CORRECT - Stable reference
const data = { id: 1, name: "John" };
const items = [1, 2, 3];
<Component data={data} items={items} />
```

### ❌ Excessive State

```typescript
// ❌ WRONG - Derived state
const [firstName, setFirstName] = useState("John");
const [lastName, setLastName] = useState("Doe");
const [fullName, setFullName] = useState("John Doe");

// ✅ CORRECT - Compute on render
const [firstName, setFirstName] = useState("John");
const [lastName, setLastName] = useState("Doe");
const fullName = `${firstName} ${lastName}`;
```
