import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useParams, useLocation } from "react-router-dom";
import axios from "axios";
import { createContext, useContext } from "react";
import "./App.css";

// API Configuration
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// API Client with Authorization Header
const createAuthenticatedClient = (token) => {
  return axios.create({
    baseURL: API,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
};
const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem("user")));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append("username", email);
      formData.append("password", password);
      
      console.log("Attempting login with:", email);
      console.log("Login endpoint:", `${API}/auth/token`);
      
      const response = await axios.post(`${API}/auth/token`, formData);
      console.log("Login response:", response.data);
      
      const { access_token, user } = response.data;
      
      localStorage.setItem("token", access_token);
      localStorage.setItem("user", JSON.stringify(user));
      
      setToken(access_token);
      setUser(user);
      
      return { success: true };
    } catch (err) {
      console.error("Login error:", err);
      setError(err.response?.data?.detail || "Login failed");
      return { success: false, error: err.response?.data?.detail || "Login failed" };
    } finally {
      setLoading(false);
    }
  };
  
  const register = async (name, email, password) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log("Attempting registration with:", email);
      console.log("Registration endpoint:", `${API}/auth/register`);
      
      const response = await axios.post(`${API}/auth/register`, {
        name,
        email,
        password
      });
      
      console.log("Registration successful:", response.data);
      
      // Automatically log in the user after successful registration
      const loginResult = await login(email, password);
      
      if (loginResult.success) {
        console.log("Auto-login after registration successful");
        return { success: true, user: response.data };
      } else {
        console.error("Auto-login after registration failed:", loginResult.error);
        return { success: true, user: response.data, autoLoginFailed: true };
      }
    } catch (err) {
      console.error("Registration error:", err);
      setError(err.response?.data?.detail || "Registration failed");
      return { success: false, error: err.response?.data?.detail || "Registration failed" };
    } finally {
      setLoading(false);
    }
  };
  
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };
  
  const getApiClient = () => {
    return createAuthenticatedClient(token);
  };
  
  const refreshUser = async () => {
    if (!token) return;
    
    try {
      const client = getApiClient();
      const response = await client.get('/users/me');
      setUser(response.data);
      localStorage.setItem("user", JSON.stringify(response.data));
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
      }
    }
  };
  
  // Periodically refresh user data
  useEffect(() => {
    if (token) {
      refreshUser();
      const interval = setInterval(refreshUser, 5 * 60 * 1000); // Refresh every 5 minutes
      return () => clearInterval(interval);
    }
  }, [token]);
  
  return (
    <AuthContext.Provider value={{ 
      token, 
      user, 
      loading, 
      error, 
      login, 
      register, 
      logout, 
      getApiClient,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

// Components
const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const handleLogout = () => {
    logout();
    navigate("/login");
  };
  
  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Link to="/" className="text-xl font-bold">
              CashX
            </Link>
            {user && (
              <div className="ml-8 hidden md:flex space-x-4">
                <Link to="/products" className="hover:text-blue-200">
                  Products
                </Link>
                <Link to="/transactions" className="hover:text-blue-200">
                  My Transactions
                </Link>
                <Link to="/cashback" className="hover:text-blue-200">
                  My Cashback
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <span className="hidden md:inline">
                  Balance: ₹{user.cashback_balance.toFixed(2)}
                </span>
                <div className="relative group">
                  <button className="flex items-center hover:text-blue-200">
                    <span className="mr-1">{user.name}</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10 hidden group-hover:block">
                    <Link to="/profile" className="block px-4 py-2 text-gray-800 hover:bg-blue-100">
                      My Profile
                    </Link>
                    <Link to="/payment-methods" className="block px-4 py-2 text-gray-800 hover:bg-blue-100">
                      Payment Methods
                    </Link>
                    <button 
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-gray-800 hover:bg-blue-100"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:text-blue-200">
                  Login
                </Link>
                <Link to="/register" className="bg-white text-blue-600 py-1 px-3 rounded-md hover:bg-blue-50">
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

// Home Page
const Home = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get(`${API}/products`);
        setProducts(response.data.slice(0, 3)); // Get first 3 products for feature section
      } catch (err) {
        console.error("Error fetching products:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProducts();
  }, []);
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-blue-600 text-white">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="flex flex-col md:flex-row items-center">
            <div className="md:w-1/2 mb-8 md:mb-0">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                Earn Cashback on Every Purchase
              </h1>
              <p className="text-lg md:text-xl mb-6">
                Shop through CashX and get rewarded with cashback on your favorite products from Amazon.
              </p>
              <div className="space-x-4">
                {user ? (
                  <Link to="/products" className="bg-white text-blue-600 py-3 px-6 rounded-md font-semibold hover:bg-blue-50">
                    Browse Products
                  </Link>
                ) : (
                  <Link to="/register" className="bg-white text-blue-600 py-3 px-6 rounded-md font-semibold hover:bg-blue-50">
                    Sign Up Now
                  </Link>
                )}
                <Link to="/how-it-works" className="py-3 px-6 rounded-md font-semibold border border-white hover:bg-blue-700">
                  How It Works
                </Link>
              </div>
            </div>
            <div className="md:w-1/2 flex justify-center">
              <img 
                src="https://images.unsplash.com/photo-1530973428-5bf2db2e4d71?q=80&w=1000&auto=format&fit=crop" 
                alt="Shopping with cashback" 
                className="rounded-lg shadow-lg max-w-full h-auto" 
                style={{ maxHeight: "400px" }}
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* How It Works */}
      <div className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">How CashX Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <div className="bg-blue-100 text-blue-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Browse Products</h3>
            <p className="text-gray-600">
              Explore our wide selection of products from Amazon with exclusive cashback offers.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <div className="bg-blue-100 text-blue-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path>
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Shop Through Our Links</h3>
            <p className="text-gray-600">
              Click on our affiliate links to shop on Amazon. Your purchases are automatically tracked.
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <div className="bg-blue-100 text-blue-600 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Earn & Redeem Cashback</h3>
            <p className="text-gray-600">
              Earn cashback on verified purchases and redeem via bank transfer or UPI.
            </p>
          </div>
        </div>
      </div>
      
      {/* Featured Products */}
      <div className="bg-gray-100 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Featured Products with Cashback</h2>
          
          {loading ? (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {products.map(product => (
                <div key={product.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <img 
                    src={product.image_url} 
                    alt={product.title}
                    className="w-full h-48 object-contain p-4"
                  />
                  <div className="p-4">
                    <h3 className="text-lg font-semibold mb-2">{product.title}</h3>
                    <p className="text-gray-600 mb-2">{product.description}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold">₹{product.price.toFixed(2)}</span>
                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                        {product.cashback_percent}% Cashback
                      </span>
                    </div>
                    <Link 
                      to={user ? `/products/${product.id}` : `/login?redirect=${encodeURIComponent(`/products/${product.id}`)}`}
                      className="block w-full text-center bg-blue-600 text-white py-2 rounded-md mt-4 hover:bg-blue-700"
                    >
                      View Product
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="text-center mt-8">
            <Link 
              to={user ? "/products" : "/login?redirect=/products"}
              className="inline-block bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
            >
              View All Products
            </Link>
          </div>
        </div>
      </div>
      
      {/* CTA Section */}
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Start Earning Cashback?</h2>
        <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
          Join thousands of smart shoppers who earn cashback on their everyday purchases. It's free to join!
        </p>
        {user ? (
          <Link to="/products" className="bg-blue-600 text-white py-3 px-8 rounded-md font-semibold text-lg hover:bg-blue-700">
            Browse Products
          </Link>
        ) : (
          <Link to="/register" className="bg-blue-600 text-white py-3 px-8 rounded-md font-semibold text-lg hover:bg-blue-700">
            Sign Up Now
          </Link>
        )}
      </div>
      
      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-lg font-semibold mb-4">CashX</h3>
              <p className="text-gray-400">
                Earn cashback on your purchases from top brands and retailers.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-2">
                <li><Link to="/" className="text-gray-400 hover:text-white">Home</Link></li>
                <li><Link to="/products" className="text-gray-400 hover:text-white">Products</Link></li>
                <li><Link to="/how-it-works" className="text-gray-400 hover:text-white">How It Works</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Help</h3>
              <ul className="space-y-2">
                <li><Link to="/faq" className="text-gray-400 hover:text-white">FAQ</Link></li>
                <li><Link to="/contact" className="text-gray-400 hover:text-white">Contact Us</Link></li>
                <li><Link to="/terms" className="text-gray-400 hover:text-white">Terms of Service</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Connect With Us</h3>
              <div className="flex space-x-4">
                <a href="#" className="text-gray-400 hover:text-white">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"></path>
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"></path>
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"></path>
                  </svg>
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-6 text-center text-gray-400">
            <p>&copy; {new Date().getFullYear()} CashX. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Login Page
const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginSuccess, setLoginSuccess] = useState(false);
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if there's a redirect param in the URL
  const searchParams = new URLSearchParams(location.search);
  const redirectTo = searchParams.get("redirect") || "/products";
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Attempting login...");
    
    const result = await login(email, password);
    console.log("Login result:", result);
    
    if (result.success) {
      setLoginSuccess(true);
      
      // Redirect to the target page after a short delay
      setTimeout(() => {
        navigate(redirectTo);
      }, 1000);
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Sign in to your account
        </h2>
      </div>
      
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {loginSuccess ? (
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="mt-3 text-lg font-medium text-gray-900">Login successful!</h3>
              <p className="mt-2 text-sm text-gray-500">
                Welcome back! Redirecting you...
              </p>
              <div className="mt-4">
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Email address
                  </label>
                  <div className="mt-1">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <div className="mt-1">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {loading ? "Signing in..." : "Sign in"}
                  </button>
                </div>
              </form>
              
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">
                      New to CashX?
                    </span>
                  </div>
                </div>
                
                <div className="mt-6">
                  <Link
                    to="/register"
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-blue-600 bg-white border-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Create an account
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Register Page
const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  
  const { register, loading, error } = useAuth();
  const navigate = useNavigate();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }
    
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters");
      return;
    }
    
    setFormError("");
    console.log("Submitting registration form...");
    
    const result = await register(name, email, password);
    console.log("Registration result:", result);
    
    if (result.success) {
      setRegistrationSuccess(true);
      
      // If auto-login was successful, redirect to products page
      // Otherwise, redirect to login page
      if (!result.autoLoginFailed) {
        setTimeout(() => navigate("/products"), 1500);
      } else {
        setTimeout(() => navigate("/login"), 1500);
      }
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Create a new account
        </h2>
      </div>
      
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {registrationSuccess ? (
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="mt-3 text-lg font-medium text-gray-900">Registration successful!</h3>
              <p className="mt-2 text-sm text-gray-500">
                Your account has been created. Redirecting you...
              </p>
              <div className="mt-4">
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            </div>
          ) : (
            <>
              {(error || formError) && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                  {error || formError}
                </div>
              )}
              
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Full Name
                  </label>
                  <div className="mt-1">
                    <input
                      id="name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Email address
                  </label>
                  <div className="mt-1">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <div className="mt-1">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Password must be at least 8 characters
                  </p>
                </div>
                
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                    Confirm Password
                  </label>
                  <div className="mt-1">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {loading ? "Creating account..." : "Create account"}
                  </button>
                </div>
              </form>
              
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">
                      Already have an account?
                    </span>
                  </div>
                </div>
                
                <div className="mt-6">
                  <Link
                    to="/login"
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-blue-600 bg-white border-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Products Page
const Products = () => {
  const { user, getApiClient } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const endpoint = selectedCategory 
          ? `${API}/products?category=${selectedCategory}` 
          : `${API}/products`;
        
        const response = await axios.get(endpoint);
        setProducts(response.data);
        
        // Extract unique categories
        const uniqueCategories = [...new Set(response.data.map(product => product.category))];
        setCategories(uniqueCategories);
      } catch (err) {
        console.error("Error fetching products:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProducts();
  }, [selectedCategory]);
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Explore Products with Cashback</h1>
        
        {/* Category Filter */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Category
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory("")}
              className={`px-4 py-2 rounded-md ${
                selectedCategory === "" 
                  ? "bg-blue-600 text-white" 
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              All
            </button>
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-md ${
                  selectedCategory === category 
                    ? "bg-blue-600 text-white" 
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map(product => (
              <div key={product.id} className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
                <img 
                  src={product.image_url} 
                  alt={product.title}
                  className="w-full h-48 object-contain p-4"
                />
                <div className="p-4 flex-grow">
                  <h3 className="text-lg font-semibold mb-2">{product.title}</h3>
                  <p className="text-gray-600 mb-2">{product.description}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">₹{product.price.toFixed(2)}</span>
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                      {product.cashback_percent}% Cashback
                    </span>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 border-t">
                  <div className="text-sm text-gray-600 mb-2">
                    Potential Cashback: ₹{((product.price * product.cashback_percent) / 100).toFixed(2)}
                  </div>
                  <Link 
                    to={`/products/${product.id}`}
                    className="block w-full text-center bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {!loading && products.length === 0 && (
          <div className="text-center py-10">
            <p className="text-gray-600">No products found in this category</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Product Detail Page
const ProductDetail = () => {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, getApiClient } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await axios.get(`${API}/products/${id}`);
        setProduct(response.data);
      } catch (err) {
        console.error("Error fetching product:", err);
        setError("Failed to load product details. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchProduct();
  }, [id]);
  
  const handleShopNow = () => {
    // In a real implementation, we would:
    // 1. Create a transaction record
    // 2. Redirect to Amazon with our affiliate link
    
    if (!user) {
      navigate("/login");
      return;
    }
    
    // For demo purposes, we'll create a transaction and then open Amazon
    const createTransaction = async () => {
      try {
        const client = getApiClient();
        
        // Create transaction record
        await client.post('/transactions', {
          product_id: product.id,
          amount: product.price,
          verification_method: "SELF_REPORTED"
        });
        
        // Open Amazon product page in new tab
        window.open(product.amazon_url, '_blank');
      } catch (err) {
        console.error("Error creating transaction:", err);
        alert("Failed to process your request. Please try again.");
      }
    };
    
    createTransaction();
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <h2 className="text-2xl font-bold mb-4">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => navigate(-1)} 
            className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }
  
  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
          <h2 className="text-2xl font-bold mb-4">Product Not Found</h2>
          <p className="text-gray-600 mb-6">The product you're looking for doesn't exist or has been removed.</p>
          <Link 
            to="/products" 
            className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
          >
            Browse Products
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="md:flex">
            <div className="md:w-1/2 p-6 flex justify-center items-center">
              <img 
                src={product.image_url} 
                alt={product.title}
                className="max-w-full h-auto object-contain"
                style={{ maxHeight: "400px" }}
              />
            </div>
            <div className="md:w-1/2 p-6">
              <div className="mb-2">
                <span className="inline-block bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded">
                  {product.category}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold mb-4">{product.title}</h1>
              <p className="text-gray-600 mb-6">{product.description}</p>
              
              <div className="mb-6">
                <div className="flex items-center mb-2">
                  <span className="text-2xl font-bold">₹{product.price.toFixed(2)}</span>
                  <span className="ml-3 bg-green-100 text-green-800 px-3 py-1 rounded text-sm">
                    {product.cashback_percent}% Cashback
                  </span>
                </div>
                <p className="text-gray-600">
                  Potential Cashback: ₹{((product.price * product.cashback_percent) / 100).toFixed(2)}
                </p>
              </div>
              
              <div className="space-y-4">
                <button
                  onClick={handleShopNow}
                  className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 flex justify-center items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
                  </svg>
                  Shop on Amazon & Earn Cashback
                </button>
                
                {!user && (
                  <p className="text-sm text-gray-600 text-center">
                    <Link to="/login" className="text-blue-600 hover:underline">Log in</Link> or <Link to="/register" className="text-blue-600 hover:underline">create an account</Link> to track your cashback
                  </p>
                )}
              </div>
              
              <div className="mt-8 border-t pt-6">
                <h3 className="font-semibold mb-2">How Cashback Works:</h3>
                <ol className="list-decimal list-inside text-gray-600 space-y-2">
                  <li>Click "Shop on Amazon & Earn Cashback" above</li>
                  <li>Complete your purchase on Amazon</li>
                  <li>Cashback will be verified and added to your CashX account</li>
                  <li>Redeem your cashback via bank transfer or UPI</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6">
          <Link to="/products" className="text-blue-600 hover:underline flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
            Back to Products
          </Link>
        </div>
      </div>
    </div>
  );
};

// Transactions Page
const Transactions = () => {
  const { getApiClient } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [products, setProducts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const client = getApiClient();
        
        // Get user's transactions
        const response = await client.get('/transactions');
        setTransactions(response.data);
        
        // Fetch product details for each transaction
        const productIds = [...new Set(response.data.map(t => t.product_id))];
        const productData = {};
        
        for (const productId of productIds) {
          try {
            const productResponse = await axios.get(`${API}/products/${productId}`);
            productData[productId] = productResponse.data;
          } catch (err) {
            console.error(`Error fetching product ${productId}:`, err);
          }
        }
        
        setProducts(productData);
      } catch (err) {
        console.error("Error fetching transactions:", err);
        setError("Failed to load transactions. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchTransactions();
  }, [getApiClient]);
  
  // Helper function to format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };
  
  // Helper function to get status badge style
  const getStatusBadge = (status) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "verified":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <h2 className="text-2xl font-bold mb-4">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link 
            to="/"
            className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-6">My Transactions</h1>
        
        {transactions.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <h2 className="text-2xl font-bold mb-4">No Transactions Found</h2>
            <p className="text-gray-600 mb-6">You haven't made any purchases yet. Browse our products to earn cashback.</p>
            <Link 
              to="/products" 
              className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cashback</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verification</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map(transaction => (
                    <tr key={transaction.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {products[transaction.product_id] ? (
                            <>
                              <div className="flex-shrink-0 h-10 w-10">
                                <img 
                                  className="h-10 w-10 object-contain" 
                                  src={products[transaction.product_id].image_url} 
                                  alt={products[transaction.product_id].title}
                                />
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">
                                  {products[transaction.product_id].title}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-gray-500">Product details unavailable</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(transaction.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ₹{transaction.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ₹{transaction.cashback_amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(transaction.status)}`}>
                          {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {transaction.verification_method === "webhook" && "Automatic"}
                        {transaction.verification_method === "manual" && "Manual Admin"}
                        {transaction.verification_method === "self_reported" && "Self-reported"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Cashback Page
const Cashback = () => {
  const { user, getApiClient } = useAuth();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [upiDetails, setUpiDetails] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Form states
  const [showBankForm, setShowBankForm] = useState(false);
  const [showUpiForm, setShowUpiForm] = useState(false);
  const [showRedemptionForm, setShowRedemptionForm] = useState(false);
  
  // Bank account form
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  
  // UPI form
  const [upiId, setUpiId] = useState("");
  
  // Redemption form
  const [redemptionAmount, setRedemptionAmount] = useState("");
  const [redemptionMethod, setRedemptionMethod] = useState("bank_transfer");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");
  const [selectedUpiId, setSelectedUpiId] = useState("");
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const client = getApiClient();
        
        // Fetch bank accounts
        const bankResponse = await client.get('/bank-accounts');
        setBankAccounts(bankResponse.data);
        
        if (bankResponse.data.length > 0) {
          const defaultBank = bankResponse.data.find(bank => bank.is_default) || bankResponse.data[0];
          setSelectedBankAccountId(defaultBank.id);
        }
        
        // Fetch UPI details
        const upiResponse = await client.get('/upi');
        setUpiDetails(upiResponse.data);
        
        if (upiResponse.data.length > 0) {
          const defaultUpi = upiResponse.data.find(upi => upi.is_default) || upiResponse.data[0];
          setSelectedUpiId(defaultUpi.upi_id);
        }
        
        // Fetch redemption history
        const redemptionResponse = await client.get('/redemptions');
        setRedemptions(redemptionResponse.data);
        
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load cashback data. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [getApiClient]);
  
  // Helper function to format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };
  
  // Helper function to get status badge style
  const getStatusBadge = (status) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  
  // Form submission handlers
  const handleAddBankAccount = async (e) => {
    e.preventDefault();
    
    try {
      const client = getApiClient();
      
      await client.post('/bank-accounts', {
        bank_name: bankName,
        account_holder: accountHolder,
        account_number: accountNumber,
        ifsc_code: ifscCode,
        is_default: true
      });
      
      // Refresh bank accounts
      const response = await client.get('/bank-accounts');
      setBankAccounts(response.data);
      
      // Reset form
      setBankName("");
      setAccountHolder("");
      setAccountNumber("");
      setIfscCode("");
      setShowBankForm(false);
      
    } catch (err) {
      console.error("Error adding bank account:", err);
      alert("Failed to add bank account. Please try again.");
    }
  };
  
  const handleAddUpi = async (e) => {
    e.preventDefault();
    
    try {
      const client = getApiClient();
      
      await client.post('/upi', {
        upi_id: upiId,
        is_default: true
      });
      
      // Refresh UPI details
      const response = await client.get('/upi');
      setUpiDetails(response.data);
      
      // Reset form
      setUpiId("");
      setShowUpiForm(false);
      
    } catch (err) {
      console.error("Error adding UPI:", err);
      alert("Failed to add UPI. Please try again.");
    }
  };
  
  const handleRedemptionRequest = async (e) => {
    e.preventDefault();
    
    if (parseFloat(redemptionAmount) <= 0) {
      alert("Please enter a valid amount");
      return;
    }
    
    if (parseFloat(redemptionAmount) > user.cashback_balance) {
      alert("Redemption amount cannot exceed your cashback balance");
      return;
    }
    
    try {
      const client = getApiClient();
      
      const requestData = {
        amount: parseFloat(redemptionAmount),
        method: redemptionMethod
      };
      
      if (redemptionMethod === "bank_transfer") {
        requestData.bank_account_id = selectedBankAccountId;
      } else if (redemptionMethod === "upi") {
        requestData.upi_id = selectedUpiId;
      }
      
      await client.post('/redemptions', requestData);
      
      // Refresh redemptions
      const redemptionsResponse = await client.get('/redemptions');
      setRedemptions(redemptionsResponse.data);
      
      // Refresh user data to update balance
      window.location.reload();
      
    } catch (err) {
      console.error("Error submitting redemption request:", err);
      alert("Failed to submit redemption request. Please try again.");
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <h2 className="text-2xl font-bold mb-4">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link 
            to="/"
            className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-6">My Cashback</h1>
        
        {/* Cashback Balance Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-gray-500">Available Balance</h2>
              <div className="text-4xl font-bold text-blue-600 mt-2">
                ₹{user.cashback_balance.toFixed(2)}
              </div>
            </div>
            
            <button
              onClick={() => setShowRedemptionForm(true)}
              disabled={user.cashback_balance <= 0}
              className={`mt-4 md:mt-0 px-6 py-3 rounded-md text-white ${
                user.cashback_balance > 0 
                  ? "bg-blue-600 hover:bg-blue-700" 
                  : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              Redeem Cashback
            </button>
          </div>
        </div>
        
        {/* Redemption Form */}
        {showRedemptionForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Redeem Cashback</h2>
              <button 
                onClick={() => setShowRedemptionForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleRedemptionRequest}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Redemption Amount
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-gray-500">₹</span>
                  </div>
                  <input
                    type="number"
                    min="100"
                    max={user.cashback_balance}
                    step="0.01"
                    required
                    value={redemptionAmount}
                    onChange={(e) => setRedemptionAmount(e.target.value)}
                    className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-7 pr-12 py-2 border-gray-300 rounded-md"
                    placeholder="0.00"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500">INR</span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Minimum ₹100. Maximum ₹{user.cashback_balance.toFixed(2)}
                </p>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Redemption Method
                </label>
                <select
                  value={redemptionMethod}
                  onChange={(e) => setRedemptionMethod(e.target.value)}
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="upi">UPI</option>
                </select>
              </div>
              
              {redemptionMethod === "bank_transfer" && (
                <div className="mb-4">
                  {bankAccounts.length > 0 ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Bank Account
                      </label>
                      <select
                        value={selectedBankAccountId}
                        onChange={(e) => setSelectedBankAccountId(e.target.value)}
                        className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        {bankAccounts.map(account => (
                          <option key={account.id} value={account.id}>
                            {account.bank_name} - {account.account_number.slice(-4).padStart(account.account_number.length, '*')}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-gray-600 mb-2">No bank accounts added yet</p>
                      <button
                        type="button"
                        onClick={() => setShowBankForm(true)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        + Add Bank Account
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {redemptionMethod === "upi" && (
                <div className="mb-4">
                  {upiDetails.length > 0 ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select UPI ID
                      </label>
                      <select
                        value={selectedUpiId}
                        onChange={(e) => setSelectedUpiId(e.target.value)}
                        className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        {upiDetails.map(upi => (
                          <option key={upi.id} value={upi.upi_id}>
                            {upi.upi_id}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-gray-600 mb-2">No UPI IDs added yet</p>
                      <button
                        type="button"
                        onClick={() => setShowUpiForm(true)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        + Add UPI ID
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              <div className="mt-6">
                <button
                  type="submit"
                  disabled={
                    (redemptionMethod === "bank_transfer" && bankAccounts.length === 0) ||
                    (redemptionMethod === "upi" && upiDetails.length === 0) ||
                    !redemptionAmount ||
                    parseFloat(redemptionAmount) <= 0 ||
                    parseFloat(redemptionAmount) > user.cashback_balance
                  }
                  className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Redemption Request
                </button>
              </div>
            </form>
          </div>
        )}
        
        {/* Payment Methods Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Bank Accounts */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Bank Accounts</h2>
                <button
                  onClick={() => setShowBankForm(!showBankForm)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  {showBankForm ? "Cancel" : "+ Add"}
                </button>
              </div>
              
              {showBankForm && (
                <form onSubmit={handleAddBankAccount} className="mb-6 border-b pb-6">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      required
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      required
                      value={accountHolder}
                      onChange={(e) => setAccountHolder(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Number
                    </label>
                    <input
                      type="text"
                      required
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      required
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <button
                    type="submit"
                    className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Add Bank Account
                  </button>
                </form>
              )}
              
              {bankAccounts.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  No bank accounts added yet
                </div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {bankAccounts.map(account => (
                    <li key={account.id} className="py-4">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">{account.bank_name}</p>
                          <p className="text-sm text-gray-500">
                            {account.account_holder}
                          </p>
                          <p className="text-sm text-gray-500">
                            {account.account_number.slice(-4).padStart(account.account_number.length, '*')}
                          </p>
                        </div>
                        {account.is_default && (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Default
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          
          {/* UPI Details */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">UPI IDs</h2>
                <button
                  onClick={() => setShowUpiForm(!showUpiForm)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  {showUpiForm ? "Cancel" : "+ Add"}
                </button>
              </div>
              
              {showUpiForm && (
                <form onSubmit={handleAddUpi} className="mb-6 border-b pb-6">
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      UPI ID
                    </label>
                    <input
                      type="text"
                      required
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="example@upi"
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <button
                    type="submit"
                    className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Add UPI ID
                  </button>
                </form>
              )}
              
              {upiDetails.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  No UPI IDs added yet
                </div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {upiDetails.map(upi => (
                    <li key={upi.id} className="py-4">
                      <div className="flex justify-between">
                        <p className="font-medium">{upi.upi_id}</p>
                        {upi.is_default && (
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                            Default
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        
        {/* Redemption History */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6">
            <h2 className="text-xl font-bold mb-6">Redemption History</h2>
            
            {redemptions.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                No redemption history yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {redemptions.map(redemption => (
                      <tr key={redemption.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(redemption.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ₹{redemption.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {redemption.method === "bank_transfer" ? "Bank Transfer" : "UPI"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(redemption.status)}`}>
                            {redemption.status.charAt(0).toUpperCase() + redemption.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { token, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  useEffect(() => {
    // Only perform the check once the loading state is settled
    if (!loading) {
      if (!token) {
        console.log("No authentication token found. Redirecting to login...");
        // Redirect to login with return path
        const currentPath = location.pathname;
        navigate(`/login?redirect=${encodeURIComponent(currentPath)}`, { replace: true });
      }
      setCheckingAuth(false);
    }
  }, [token, loading, navigate, location]);
  
  if (loading || checkingAuth) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  // If there's no token and we're not loading, don't render the children
  if (!token) {
    return null;
  }
  
  // If there is a token, render the children
  return children;
};

// Main App Component
function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/products" element={
                <ProtectedRoute>
                  <Products />
                </ProtectedRoute>
              } />
              <Route path="/products/:id" element={
                <ProtectedRoute>
                  <ProductDetail />
                </ProtectedRoute>
              } />
              <Route path="/transactions" element={
                <ProtectedRoute>
                  <Transactions />
                </ProtectedRoute>
              } />
              <Route path="/cashback" element={
                <ProtectedRoute>
                  <Cashback />
                </ProtectedRoute>
              } />
              <Route path="/payment-methods" element={
                <ProtectedRoute>
                  <Cashback />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <div className="container mx-auto py-8 px-4">
                    <h1 className="text-3xl font-bold mb-6">My Profile</h1>
                    <p className="text-gray-600">Profile page will be implemented in the next phase.</p>
                  </div>
                </ProtectedRoute>
              } />
              <Route path="/how-it-works" element={<div className="container mx-auto py-8 px-4">
                <h1 className="text-3xl font-bold mb-6">How CashX Works</h1>
                <p className="text-gray-600">Detailed explanation page will be implemented in the next phase.</p>
              </div>} />
              <Route path="*" element={
                <div className="min-h-screen flex justify-center items-center bg-gray-50">
                  <div className="text-center max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
                    <h1 className="text-3xl font-bold text-red-600 mb-4">404</h1>
                    <h2 className="text-xl font-semibold mb-3">Page Not Found</h2>
                    <p className="text-gray-600 mb-6">The page you're looking for doesn't exist or has been moved.</p>
                    <Link to="/" className="inline-block bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700">
                      Return Home
                    </Link>
                  </div>
                </div>
              } />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
