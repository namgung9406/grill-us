export interface AuthenticatedUser {
  objectId: string;
  displayName: string;
  email: string | null;
}

export interface AuthContextValue {
  status: "loading" | "anonymous" | "authenticated" | "error";
  user: AuthenticatedUser | null;
  errorMessage: string | null;
  login: (returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  acquireGraphToken: () => Promise<string>;
  acquireApiToken: () => Promise<string>;
  retry: () => void;
}