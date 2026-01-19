"use client";

import { useState, useEffect, ReactNode } from "react";

type RokuWrapperProps = {
  children: ReactNode;
};

// Known Roku browser viewport resolutions (always reports landscape)
const ROKU_RESOLUTIONS = [
  { width: 1920, height: 1080 }, // 1080p Roku UI mode
  { width: 3840, height: 2160 }, // 4K Roku UI mode
];

function isRokuViewport(width: number, height: number): boolean {
  return ROKU_RESOLUTIONS.some(
    (res) => res.width === width && res.height === height
  );
}

export default function RokuWrapper({ children }: RokuWrapperProps) {
  const [isRoku, setIsRoku] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    function checkViewport() {
      const width = window.innerWidth;
      const height = window.innerHeight;

      setViewportSize({ width, height });
      setIsRoku(isRokuViewport(width, height));
    }

    // Check on mount
    checkViewport();

    // Re-check on resize (in case of Roku mode changes)
    window.addEventListener("resize", checkViewport);

    return () => {
      window.removeEventListener("resize", checkViewport);
    };
  }, []);

  // If not Roku, render children normally
  if (!isRoku) {
    return <>{children}</>;
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
    </div>
  );
}
