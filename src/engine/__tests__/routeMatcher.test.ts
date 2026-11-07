import { describe, it, expect } from "vitest";
import { normalizeRoutePath, routesMatch } from "../routeMatcher";

describe("routeMatcher", () => {
  describe("normalizeRoutePath", () => {
    it("strips query strings and hash fragments", () => {
      expect(normalizeRoutePath("/api/projects?limit=10&id=1")).toBe("/api/projects");
      expect(normalizeRoutePath("/api/projects#section")).toBe("/api/projects");
      expect(normalizeRoutePath("/api/projects?query=true#hash")).toBe("/api/projects");
    });

    it("normalizes trailing and leading slashes", () => {
      expect(normalizeRoutePath("api/projects/")).toBe("/api/projects");
      expect(normalizeRoutePath("/")).toBe("/");
    });
  });

  describe("routesMatch", () => {
    it("matches exact routes", () => {
      expect(routesMatch("/api/projects", "/api/projects")).toBe(true);
    });

    it("matches route with query strings to clean backend route", () => {
      expect(routesMatch("/api/projects?page=1", "/api/projects")).toBe(true);
    });

    it("matches dynamic segments positionally across naming styles", () => {
      expect(routesMatch("/api/projects/[id]", "/api/projects/[projectId]")).toBe(true);
      expect(routesMatch("/api/projects/${item.id}", "/api/projects/[id]")).toBe(true);
      expect(routesMatch("/api/projects/[id]", "/api/projects/${item.id}")).toBe(true);
      expect(routesMatch("/api/projects/123", "/api/projects/[id]")).toBe(true);
    });

    it("returns false for mismatched segments or lengths", () => {
      expect(routesMatch("/api/v1/projects/delete", "/api/projects")).toBe(false);
      expect(routesMatch("/api/users", "/api/projects")).toBe(false);
      expect(routesMatch("/api/projects/[id]/comments", "/api/projects/[id]")).toBe(false);
    });
  });
});

