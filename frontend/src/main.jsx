import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import Shop from './pages/Shop.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Blog from './pages/Blog.jsx';
import Post from './pages/Post.jsx';
import Workshops from './pages/Workshops.jsx';
import Admin from './pages/Admin.jsx';
import Configurator from './features/configurator/Configurator.jsx';
import Kanban from './features/kanban/Kanban.jsx';
import Loyalty from './pages/Loyalty.jsx';
import POS from './pages/POS.jsx';
import Notebook from './pages/Notebook.jsx';
import NotFound from './pages/NotFound.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:slug" element={<Product />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<Post />} />
        <Route path="/workshops" element={<Workshops />} />
        <Route path="/configurator" element={<Configurator />} />
        <Route path="/kanban" element={<Kanban />} />
        <Route path="/loyalty" element={<Loyalty />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/notebook" element={<Notebook />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </ErrorBoundary>
);
