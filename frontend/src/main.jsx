import { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { applyTheme } from './lib/theme';
import { initColorMode, applyDefaultColorMode } from './lib/colorMode';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import SiteLayout from './components/layout/SiteLayout.jsx';
import StaffBar from './components/layout/StaffBar.jsx';

// Route-level code splitting: only the home page ships in the entry chunk;
// everything else (Admin, POS, …) loads on navigation.
const Shop = lazy(() => import('./pages/Shop.jsx'));
const Product = lazy(() => import('./pages/Product.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const Blog = lazy(() => import('./pages/Blog.jsx'));
const Post = lazy(() => import('./pages/Post.jsx'));
const Workshops = lazy(() => import('./pages/Workshops.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Configurator = lazy(() => import('./features/configurator/Configurator.jsx'));
const Kanban = lazy(() => import('./features/kanban/Kanban.jsx'));
const Loyalty = lazy(() => import('./pages/Loyalty.jsx'));
const POS = lazy(() => import('./pages/POS.jsx'));
const Notebook = lazy(() => import('./pages/Notebook.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Privacy = lazy(() => import('./pages/Privacy.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

// Global theme + colour mode: runs once for every route (deep links included)
initColorMode();
applyTheme().then((s) => { if (s?.default_color_mode) applyDefaultColorMode(s.default_color_mode); });

const pageFallback = (
  <div className="min-h-screen flex items-center justify-center text-sm text-muted">Loading…</div>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <Suspense fallback={pageFallback}>
        <Routes>
          {/* Customer-facing routes — shared header/footer, scroll reset, maintenance gate */}
          <Route element={<SiteLayout />}>
            <Route path="/" element={<App />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/product/:slug" element={<Product />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<Post />} />
            <Route path="/workshops" element={<Workshops />} />
            <Route path="/configurator" element={<Configurator />} />
            <Route path="/loyalty" element={<Loyalty />} />
            <Route path="/notebook" element={<Notebook />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          {/* Full-screen staff tools — slim bar with a way home */}
          <Route element={<StaffBar />}>
            <Route path="/pos" element={<POS />} />
            <Route path="/kanban" element={<Kanban />} />
          </Route>
          {/* Studio console — keeps its own chrome */}
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </ErrorBoundary>
);
