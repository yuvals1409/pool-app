import React from "react";
import BootError from "./BootError.jsx";
import { captureException } from "../lib/sentry.js";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("App render error:", error);
    captureException(error);
  }

  render() {
    if (this.state.error) {
      return (
        <BootError
          title="שגיאה בטעינת המערכת"
          message="משהו השתבש בעת הצגת המסך. נסה לרענן את הדף."
          details={this.state.error?.message || String(this.state.error)}
        />
      );
    }
    return this.props.children;
  }
}
