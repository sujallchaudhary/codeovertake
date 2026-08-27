import { RouterProvider } from "react-router";
import { AuthProvider } from "./AuthContext";
import { router } from "./routes";

export default function App() {
  return (
    // AuthProvider sits above the router so every route can read the session
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
