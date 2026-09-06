import { useEffect } from "react";
import { RouterProvider, useRouter, matchPath } from "./lib/router";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Editor } from "./pages/Editor";
import { Templates } from "./pages/Templates";
import { Profile } from "./pages/Profile";
import { Admin } from "./pages/Admin";
import { Skeleton } from "./components/ui";

function Routes() {
  const { path, navigate } = useRouter();
  const { user, loading } = useAuth();

  const editor = matchPath("/app/p/:id", path);
  const templates = path === "/app/templates";
  const brand = path === "/app/profile" || path === "/app/brand";
  const admin = path === "/app/admin";
  const isApp = path === "/app" || templates || brand || admin || Boolean(editor);

  useEffect(() => {
    if (loading) return;
    if (isApp && !user) navigate("/login", { replace: true });
    if ((path === "/login" || path === "/") && user) navigate("/app", { replace: true });
    if (path === "/" && !user) navigate("/login", { replace: true });
  }, [loading, user, path, isApp, navigate]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-24 w-full" />
      </div>
    );
  }
  if (path === "/login") return <Login />;
  if (editor && user) return <Editor key={editor.id} id={editor.id!} />;
  if (templates && user) return <Templates />;
  if (brand && user) return <Profile />;
  if (admin && user?.isAdmin) return <Admin />;
  if (path === "/app" && user) return <Dashboard />;
  if (!user) return null; // redirecting
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-graphite dark:text-stone-400">There is nothing at this address.</p>
      <a href="/app" className="mt-6 inline-block font-medium text-brand underline underline-offset-4 dark:text-indigo-300">Back to your proposals</a>
    </main>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider>
        <AuthProvider>
          <Routes />
        </AuthProvider>
      </RouterProvider>
    </ThemeProvider>
  );
}
