"use client";

import React, { useState } from "react";

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    // BUG #3 (TYPE_CHEAT - YELLOW WIRE):
    // Type casting to `as any` on the network response boundary
    const data = (await res.json()) as any;

    // BUG #2 Consumer side:
    // Expects userId and sessionToken, while /api/register returned user_id and token
    if (data.userId && data.sessionToken) {
      setStatus(`Registered successfully: ${data.userId}`);
    } else {
      setStatus("Registration error: missing user credentials");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">Register</button>
      {status && <p>{status}</p>}
    </form>
  );
}

