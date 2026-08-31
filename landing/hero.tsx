import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FloorPlan } from '@/canvas/FloorPlan';
import { useProjectStore } from '@/store/project';
import { demoProject } from '@/model/demo';
import '@/index.css';

/**
 * The hero is the real planner canvas, not a picture of one.
 *
 * It is loaded only after the page has painted: first paint is an inline SVG in
 * the HTML, so the page is legible on a slow connection before any JavaScript
 * arrives, and this module then replaces that SVG with the working component.
 *
 * Nothing here touches localStorage — the autosave subscription lives in the
 * app shell — so playing with the demo on the marketing page cannot overwrite a
 * visitor's real seating plan.
 */
export function mountHero(container: HTMLElement): void {
  useProjectStore.getState().replaceProject(demoProject());

  const root = createRoot(container);
  // Rendered straight into the mount node: an extra wrapper would sit outside
  // the `.hero-figure > *` sizing rule and collapse the canvas to zero height.
  root.render(
    <StrictMode>
      <FloorPlan showToolbar={false} />
    </StrictMode>,
  );

  container.dataset.mounted = 'true';
}
