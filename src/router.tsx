import {
  Navigate,
  Outlet,
  createBrowserRouter,
  redirect,
  type LoaderFunctionArgs,
  type RouteObject,
} from "react-router";

import Index from "@/pages/Index";
import AuthPage from "@/pages/Auth";
import ForgotPasswordPage from "@/pages/ForgotPassword";
import ResetPasswordPage from "@/pages/ResetPassword";
import Browse from "@/pages/Browse";
import ListingDetail from "@/pages/ListingDetail";
import PostListing from "@/pages/PostListing";
import MyListings from "@/pages/MyListings";
import Messages from "@/pages/Messages";
import Account from "@/pages/Account";
import Consent from "@/pages/Consent";
import Admin from "@/pages/Admin";
import Legal from "@/pages/Legal";
import { ErrorComponent, NotFoundComponent } from "@/pages/RootErrors";
import { getSession, hasAcceptedTerms, homePathForRole, signInPath } from "@/lib/profile";

const currentPath = (request: Request) => {
  const url = new URL(request.url);
  return url.pathname + url.search;
};

// Signed-in guard: user + their profiles row (role comes from profiles.role).
async function requireSession({ request }: LoaderFunctionArgs) {
  const session = await getSession();
  if (!session) throw redirect(signInPath(currentPath(request)));
  return session;
}

// Signed in AND agreed to the current terms — needed to post or message.
// (RLS also refuses listings from members who haven't agreed.)
async function memberLoader(args: LoaderFunctionArgs) {
  const session = await requireSession(args);
  if (!hasAcceptedTerms(session.profile)) {
    throw redirect(`/consent?next=${encodeURIComponent(currentPath(args.request))}`);
  }
  return session;
}

// Public pages: the session is optional.
async function optionalSession() {
  return getSession();
}

// UX only — the real control is RLS plus the admin-checked RPCs.
async function adminLoader(args: LoaderFunctionArgs) {
  const session = await requireSession(args);
  if (session.profile.role !== "admin") throw redirect(homePathForRole(session.profile.role));
  return session;
}

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Outlet />,
    errorElement: <ErrorComponent />,
    children: [
      { index: true, loader: optionalSession, element: <Index /> },
      {
        // One mounted auth page shared by /sign-in and /sign-up, so switching
        // between them keeps what the user typed.
        element: <AuthPage />,
        children: [
          { path: "sign-in", element: null },
          { path: "sign-up", element: null },
        ],
      },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
      { path: "consent", loader: requireSession, element: <Consent /> },
      { path: "cars", loader: optionalSession, element: <Browse kind="sell" /> },
      { path: "wanted", loader: optionalSession, element: <Browse kind="want" /> },
      { path: "listings/:id", loader: optionalSession, element: <ListingDetail /> },
      { path: "listings/:id/edit", loader: memberLoader, element: <PostListing /> },
      { path: "post", loader: memberLoader, element: <PostListing /> },
      { path: "my", loader: memberLoader, element: <MyListings /> },
      { path: "messages", loader: memberLoader, element: <Messages /> },
      { path: "account", loader: requireSession, element: <Account /> },
      { path: "admin", loader: adminLoader, element: <Admin /> },
      { path: "terms", loader: optionalSession, element: <Legal doc="terms" /> },
      { path: "privacy", loader: optionalSession, element: <Legal doc="privacy" /> },
      { path: "disclaimer", loader: optionalSession, element: <Legal doc="disclaimer" /> },
      { path: "login", element: <Navigate to="/sign-in" replace /> },
      { path: "*", element: <NotFoundComponent /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
