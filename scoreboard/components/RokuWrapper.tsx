"use client";

import { useState, useEffect, ReactNode } from "react";

type RokuWrapperProps = {
  children: ReactNode;
};

// Check if viewport is 16:9 landscape (width > height) with minimum 1080p
// This catches Roku TVs that may report slightly different dimensions
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
  // Always show debug for now to diagnose
  const [showDebug, setShowDebug] = useState(true);
  const [forceMode, setForceMode] = useState<"auto" | "on" | "off">("auto");

  useEffect(() => {
    // Check URL params for force mode
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("debug") === "off") {
        setShowDebug(false);
      }
      if (params.get("rotate") === "on") {
        setForceMode("on");
      } else if (params.get("rotate") === "off") {
        setForceMode("off");
      }
    } catch (e) {
      // URLSearchParams might not be supported on Roku
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

  // Debug overlay (add ?debug to URL to show)
  const debugOverlay = showDebug && (
    <div
      style={{
        position: "fixed",
        bottom: "10px",
        left: "10px",
        background: "rgba(0,0,0,0.8)",
        color: "#0f0",
        padding: "10px",
        fontFamily: "monospace",
        fontSize: "14px",
        zIndex: 10000,
        borderRadius: "4px",
      }}
    >
      <div>Viewport: {viewportSize.width} × {viewportSize.height}</div>
      <div>Aspect: {(viewportSize.width / viewportSize.height).toFixed(3)}</div>
      <div>16:9 Landscape: {shouldRotate ? "YES" : "NO"}</div>
      <div>Force Mode: {forceMode}</div>
      <div>Rotating: {isRotating ? "YES" : "NO"}</div>
      <div style={{ marginTop: "5px", fontSize: "11px", color: "#888" }}>
        ?rotate=on / ?rotate=off to force
      </div>
    </div>
  );

  // If not rotating, render children normally
  if (!isRotating) {
    return (
      <>
        {children}
        {debugOverlay}
      </>
    );
  }

  // For Roku: rotate 90deg and size to 1080x1920 portrait
  // The viewport is landscape (e.g., 1920x1080), but TV is mounted portrait
  // We need to rotate the content 90deg clockwise and fit it

  // Calculate the scale to fit 1080x1920 content into the viewport
  // After 90deg rotation: content width becomes height, content height becomes width
  // Target: 1080 wide x 1920 tall (portrait)
  // Available: viewportWidth x viewportHeight (landscape, e.g., 1920x1080)
  // After rotation, the 1920 tall side needs to fit in viewportWidth
  // and the 1080 wide side needs to fit in viewportHeight

  const targetWidth = 1080;
  const targetHeight = 1920;

  // After 90deg rotation:
  // - What was targetHeight (1920) now spans horizontally -> must fit in viewportWidth
  // - What was targetWidth (1080) now spans vertically -> must fit in viewportHeight
  const scaleX = viewportSize.width / targetHeight;
  const scaleY = viewportSize.height / targetWidth;
  const scale = Math.min(scaleX, scaleY);

  return (
    <div className="roku-viewport-container">
      <div
        className="roku-rotated-wrapper"
        style={{
          width: `${targetWidth}px`,
          height: `${targetHeight}px`,
          transform: `rotate(90deg) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
      {debugOverlay}
    </div>
  );
}
