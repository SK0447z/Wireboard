"use client";

import React, { useEffect, useState } from "react";

interface Project {
  id: string;
  name: string;
  owner_id: string;
}

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    // Healthy Call (GREEN WIRE): Matches GET /api/projects returning { projects: [...] }
    async function fetchProjects() {
      const res = await fetch("/api/projects", { method: "GET" });
      const data = await res.json();
      if (data.projects) {
        setProjects(data.projects);
      }
    }
    fetchProjects();
  }, []);

  // BUG #5 (MISSING_ENDPOINT - RED WIRE):
  // Hallucinated endpoint that does not exist anywhere in the backend routes
  const handleDelete = async (projectId: string) => {
    await fetch("/api/v1/projects/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId }),
    });
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Projects</h1>
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <span>{p.name}</span>
            <button onClick={() => handleDelete(p.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

