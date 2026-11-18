import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/main.css";
import { initializePwa } from "./pwa/register";

initializePwa();

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>加载失败</h1>
        <p>画面遇到异常。自动存档仍保留在浏览器中。</p>
        <pre>{this.state.error}</pre>
        <button onClick={() => location.reload()}>重新载入</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
