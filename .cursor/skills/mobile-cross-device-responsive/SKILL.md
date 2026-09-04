---
name: mobile-cross-device-responsive
description: Convert or optimize static websites (HTML/CSS/JS, SSG exports, templates) for seamless high-performance experiences across mobile phones, tablets, foldables, laptops, and ultra-wide screens. Use when fixing responsive layout, mobile viewport issues, touch targets, fluid typography, hamburger navigation, safe-area insets, or cross-device CSS for static sites.
disable-model-invocation: true
---

# Skill: Mobile & Cross-Device Responsive Optimization for Static Websites

## Purpose
Convert or optimize the static website (HTML/CSS/JS, SSG exports, templates) to deliver a seamless, high-performance experience across mobile phones, tablets, foldables, laptops, and ultra-wide screens.

---

## 1. Core Diagnostics & Viewport Setup

### 1.1 Mandatory Viewport Meta Tag
Inspect `<head>`. If missing or misconfigured, inject standard viewport control:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```
* `viewport-fit=cover`: Required for edge-to-edge rendering around mobile notches, dynamic islands, and home indicator bars.

### 1.2 Universal Box Sizing & Fluid Root
Ensure modern sizing reset in CSS to avoid padding/border width blowouts:
```css
*, *::before, *::after {
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  scroll-behavior: smooth;
}

body {
  margin: 0;
  padding: 0;
  min-height: 100dvh; /* Dynamic viewport height handles browser address bars */
  overflow-x: hidden; /* Hard guardrail against horizontal scroll jitter */
}
```

---

## 2. Layout & Fluid Geometry

### 2.1 Kill Fixed Pixel Widths
Identify any hardcoded widths (`width: 800px;`, `width: 1200px;`) and replace with bounded fluid dimensions:
* Bad: `width: 960px;`
* Good: `width: 100%; max-width: 960px; margin-inline: auto;`

### 2.2 Fluid Grid & Flexbox Replacements
* **Grid Auto-fit (Preferred for cards, galleries, product lists):**
  ```css
  .grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: clamp(1rem, 2.5vw, 2rem);
  }
  ```
* **Flex Wrap (For nav bars, tag clouds, button groups):**
  ```css
  .flex-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  ```

### 2.3 Fluid Typography & Spacing
Use `clamp()` for headers and body text so they scale seamlessly between 360px phones and 1440px desktop screens without endless media query overrides:
```css
:root {
  --text-base: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
  --text-h1: clamp(1.85rem, 1.4rem + 2.2vw, 3.25rem);
  --text-h2: clamp(1.5rem, 1.2rem + 1.5vw, 2.25rem);
  --section-py: clamp(2rem, 5vw, 5rem);
  --container-px: clamp(1rem, 4vw, 2.5rem);
}
```

---

## 3. Touch Targets & Mobile Ergonomics

### 3.1 44px / 48px Minimum Tap Targets
Every link, button, input, and icon trigger must meet Apple (44x44px) and Google (48x48px) interactive guidelines:
```css
button, a, input, select, textarea {
  min-height: 44px;
  min-width: 44px;
}

/* For small inline text links or icon buttons, expand target area with pseudo-element */
.icon-button {
  position: relative;
}
.icon-button::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 48px;
  height: 48px;
}
```

### 3.2 Prevent Unwanted iOS Auto-Zoom on Inputs
iOS Safari automatically zooms in when text input `font-size` is smaller than 16px:
```css
input[type="text"],
input[type="email"],
input[type="tel"],
input[type="number"],
input[type="search"],
textarea,
select {
  font-size: 16px; /* Do not use font sizes < 16px on mobile inputs */
}
```

### 3.3 Safe Area Insets (Notches & Home Bars)
Prevent UI from clipping under device notches, camera cutouts, or iOS navigation bars:
```css
header {
  padding-top: max(1rem, env(safe-area-inset-top));
}

footer, .bottom-nav, .fixed-cta {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
  padding-left: max(1rem, env(safe-area-inset-left));
  padding-right: max(1rem, env(safe-area-inset-right));
}
```

---

## 4. Media & Component Responsiveness

### 4.1 Responsive Images, Videos & Canvas
Never allow images or iframes to overflow their parent wrapper:
```css
img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;
  height: auto;
}

/* Responsive iframe embeds (YouTube, Vimeo, Maps) */
.iframe-container {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
}
.iframe-container iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
```

### 4.2 Data Tables
Tables break on mobile by default. Wrap tables in a container with horizontal scroll indicators:
```html
<div class="table-wrapper">
  <table>...</table>
</div>
```
```css
.table-wrapper {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border: 1px solid #e2e8f0;
}
```

---

## 5. Navigation Pattern Migration (Desktop -> Mobile)

### 5.1 Mobile Drawer / Hamburger Setup
1. Keep the markup accessible using `aria-expanded` and `aria-controls`.
2. Stack links vertically when drawer is open.
3. Lock body scroll when mobile menu is active (`document.body.style.overflow = 'hidden'`).
4. Trap focus inside the navigation drawer if modal/fullscreen.

```html
<button class="nav-toggle" aria-expanded="false" aria-label="Toggle navigation">
  <span class="hamburger-bar"></span>
</button>
<nav class="site-nav" id="primary-nav">
  <ul>
    <li><a href="#services">Services</a></li>
    <li><a href="#pricing">Pricing</a></li>
    <li><a href="#contact">Contact</a></li>
  </ul>
</nav>
```

```css
@media (max-width: 768px) {
  .site-nav {
    position: fixed;
    top: 0;
    right: 0;
    width: 80%;
    max-width: 320px;
    height: 100dvh;
    background: #ffffff;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 1000;
  }
  .site-nav[data-open="true"] {
    transform: translateX(0);
  }
}
```

---

## 6. Audit & Validation Checklist

Before marking a static site as mobile-ready, verify every item:

| Area | Checkpoint | Verification Method |
| :--- | :--- | :--- |
| **Overflow** | No horizontal scroll bar at 320px, 375px, 390px, 412px | Run DevTools responsive mode + run `document.querySelectorAll('*').forEach(el => el.scrollWidth > window.innerWidth && console.log(el))` |
| **Fonts** | All text readable without pinch-zoom (minimum 14px body, 16px inputs) | Visual inspection on simulated iPhone SE & Pixel 7 |
| **Taps** | Buttons spaced adequately; no accidental mis-clicks | 8px+ clearance between interactive links/buttons |
| **Assets** | Large images don't freeze mobile networks | Use `srcset` or modern formats (`.webp`, `.avif`) with `loading="lazy"` |
| **Forms** | Appropriate mobile keyboard triggers via `inputmode` (`tel`, `numeric`, `email`, `url`) | Verify soft keyboard layouts on target devices |
