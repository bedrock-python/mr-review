import { Providers } from "./providers";
import { Router } from "./routes";

export const App = () => {
  return (
    <Providers>
      <Router />
    </Providers>
  );
};
