"use client";

import { useState, useEffect, ReactNode } from "react";

type RokuWrapperProps = {
  children: ReactNode;
};

// Check if viewport is 16:9 landscape (width > height) with minimum 1080p
// This catches Roku/Samsung TVs that may report slightly different dimensions
function isLandscape16by9(width: number, height: number): boolean {
  if (width <= height) return false; // Must be landscape
  if (width < 1920) return false; // At least 1080p width

  const aspectRatio = width / height;
  const target = 16 / 9; // ~1.777
  const tolerance = 0.05; // Allow 5% tolerance

  return Math.abs(aspectRatio - target) < tolerance;
}

export default function RokuWrapper({ children }: RokuWrapperProps) {
  const [shouldRotate, setShouldRotate] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  // Debug overlay disabled by default (add ?debug to URL to show)
  const [showDebug, setShowDebug] = useState(false);
  const [forceMode, setForceMode] = useState<"auto" | "on" | "off">("auto");

  useEffect(() => {
    // Check URL params for debug and force mode
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has("debug")) {
        setShowDebug(true);
      }
      if (params.get("rotate") === "on") {
        setForceMode("on");
      } else if (params.get("rotate") === "off") {
        setForceMode("off");
      }
    } catch (e) {
      // URLSearchParams might not be supported on some TV browsers
      console.error("URL params error:", e);
    }

    function checkViewport() {
      const width = window.innerWidth;
      const height = window.innerHeight;

      setViewportSize({ width, height });
      setShouldRotate(isLandscape16by9(width, height));
    }

    // Check on mount
    checkViewport();

    // Re-check on resize
    window.addEventListener("resize", checkViewport);

    return () => {
      window.removeEventListener("resize", checkViewport);
    };
  }, []);

  // Determine if we should actually rotate based on force mode
  const isRotating = forceMode === "on" || (forceMode === "auto" && shouldRotate);

  // Safe aspect ratio calculation (avoid NaN)
  const aspectRatio = viewportSize.height > 0
    ? (viewportSize.width / viewportSize.height).toFixed(3)
    : "...";

  // Debug overlay - always rendered when showDebug is true
  const debugOverlay = showDebug ? (
    <div
      style={{
        position: "fixed",
        bottom: 10,
        left: 10,
        background: "rgba(0,0,0,0.9)",
        color: "#00ff00",
        padding: 15,
        fontFamily: "monospace",
        fontSize: 18,
        zIndex: 99999,
        borderRadius: 8,
        border: "2px solid #00ff00",
      }}
    >
      <div>Viewport: {viewportSize.width} x {viewportSize.height}</div>
      <div>Aspect: {aspectRatio}</div>
      <div>Detect: {shouldRotate ? "YES" : "NO"}</div>
      <div>Rotating: {isRotating ? "YES" : "NO"}</div>
    </div>
  ) : null;

  // If not rotating, render children normally
  if (!isRotating) {
    return (
      <>
        {children}
        {debugOverlay}
      </>
    );
  }

  // For TV: rotate -90deg (counter-clockwise) and size to 1080x1920 portrait
  // The viewport is landscape (e.g., 1920x1080), but TV is mounted portrait
  // We need to rotate the content 90deg counter-clockwise and fit it

  const targetWidth = 1080;
  const targetHeight = 1920;

  // After -90deg rotation:
  // - What was targetHeight (1920) now spans horizontally -> must fit in viewportWidth
  // - What was targetWidth (1080) now spans vertically -> must fit in viewportHeight
  const scaleX = viewportSize.width / targetHeight;
  const scaleY = viewportSize.height / targetWidth;
  const scale = Math.min(scaleX, scaleY);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: targetWidth,
          height: targetHeight,
          overflow: "hidden",
          background: "#000",
          transform: `rotate(-90deg) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
      {debugOverlay}
    </div>
  );
}
