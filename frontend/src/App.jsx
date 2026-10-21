import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";

// Static import for Home route (as specified in Practical 8 requirements)
import Home from "./pages/Home";

// Practical 8 Requirement: Route-based Code Splitting using React.lazy()
// Projects and Contact pages are dynamically imported on-demand
const Projects = lazy(() => import("./pages/Projects"));
const Contact = lazy(() => import("./pages/Contact"));

// Meaningful loading fallback UI displayed by Suspense during lazy chunk fetching
function LoadingPage() {
  return (
    <div style={{ textAlign: "center", padding: "40px" }}>
      <h2>Loading...</h2>
      <p>Please wait while the page loads.</p>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <main className="content">
          {/* Suspense boundary catches pending lazy imports and shows fallback UI */}
          <Suspense fallback={<LoadingPage />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/contact" element={<Contact />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </Router>
  );
}

export default App;
