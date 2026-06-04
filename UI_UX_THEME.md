# Tracr UI/UX Theme Specification & Layout Blueprint
**Version**: 1.0  
**Project**: Tracr (Personal Finance Tracker)  
**Target Stack**: React, Vite, Tailwind CSS v4, Lucide Icons, Recharts  

---

## 🎨 1. Design Vision & Anti-"AI Slop" Guidelines

Many AI-generated interfaces feel like generic templates or "AI Slop"—characterized by excessive border-radii, overdone drop-shadows, useless empty space, random gradients, and mobile-phone emulators centered on wide desktop viewports. 

Tracr’s visual identity is **structured, high-fidelity, high-density, and screen-adaptive**. It behaves like a modern trading terminal combined with a premium neobank dashboard.

### 🚫 The "AI Slop" Checklist (What to Avoid)
1. **The Phone Sandbox on Desktop**: Never lock the layout to `max-w-md` or `max-w-2xl` on large monitors. If a user has a 27-inch browser, use the columns and grids to present density, comparative data, and side-by-side activity panels.
2. **Over-rounding Everything**: Do not round minor buttons, inputs, and cards to `rounded-full` or `rounded-3xl` indiscriminately. Use strict corner radius hierarchies:
   - Outer layout panels / main sidebar: `rounded-none` or `rounded-[32px]`
   - Standard data cards: `rounded-2xl` (16px)
   - Inputs, buttons, dropdowns: `rounded-xl` (12px)
   - Badges, tag chips: `rounded-lg` (8px)
3. **Generic Gradients & Bad Color Contrast**: Avoid random pastel gradients behind plain text. Colors must be dark, high-contrast, and meaningful (e.g., using emerald/teal *only* for positive cashflows or core action buttons, rose/crimson *only* for expenses or warnings).
4. **Low Information Density**: Do not display a page with only 3 gigantic cards containing huge icons and single numbers. Users want dense tables, sparklines, clean grids, and filter bars close together.

---

## 📱 2. Responsive Layout Grid & Breakpoint System

Tracr adjusts its columns and sidebars based on browser aspect ratios, utilizing the full viewport space.

```
DESKTOP VIEWPORT (>1024px)
+------------------------------------------------------------------------------------+
| SIDEBAR   | HEADER & QUICK METRICS                                      | PROFILE  |
|           | [Total Net Worth]  [Cashflow Balance]                       | &        |
| - Home    +-------------------------------------------------------------| QUICK    |
| - Wallet  | MAIN CONTENT (Grid)                                         | ACTIONS  |
| - Feed    |                                                             |          |
| - Tags    | [ Recharts Spent Graph ]      [ Accounts Deck Grid ]        | - Log Tx |
| - Config  | (takes 3/5 width)             (takes 2/5 width)             | - Active |
|           |                                                             |   Alerts |
|           | [ Recent Activities Feed ]                                  |          |
+------------------------------------------------------------------------------------+
```

### 📐 Breakpoint Layout Matrix

| Breakpoint | Viewport Width | Navigation Structure | Layout Grid Columns |
| :--- | :--- | :--- | :--- |
| **Mobile** | `< 640px` | Floating bottom navigation pill (`glass-nav`). | Single-column stacked feed. |
| **Tablet** | `640px - 1024px` | Mini left icon-sidebar (collapsible text). | Split dual-column grid (60% main content, 40% accounts list). |
| **Desktop** | `1024px - 1536px` | Full left sidebar navigation + top page header. | Three-column workspace (Sidebar: 1/5, Main Pane: 3/5, Sidebar Widget Drawer: 1/5). |
| **Ultra-Wide**| `> 1536px` | Locked left sidebar + central grid view. | Grid cards expand horizontally with responsive content columns. |

---

## 🎨 3. Color Palette & Typography Tokens

Tracr supports two high-fidelity themes: **Obsidian Space (Dark)** and **Pearl Ice (Light)**.

### 🌌 A. Design System Variables (Tailwind CSS v4)
Configure your CSS variables to map exact semantic weights:

```css
:root {
  /* Pearl Ice Theme (Light Mode) */
  --bg-app: #f4f6fa;
  --surface-panel: #ffffff;
  --surface-item: #f8fafc;
  --border-line: #e6ecf5;
  --text-main: #070a13;
  --text-muted: #64748b;
  --primary-accent: #059669; /* Emerald */
  --primary-accent-glow: rgba(5, 150, 105, 0.1);
  --danger-accent: #e11d48; /* Rose */
  
  --font-body: 'Plus Jakarta Sans', sans-serif;
  --font-data: 'Outfit', sans-serif;
  
  --shadow-flat: 0 1px 3px rgba(9, 14, 26, 0.05);
  --shadow-rise: 0 8px 30px rgba(9, 14, 26, 0.04);
}

.dark {
  /* Obsidian Space Theme (Dark Mode) */
  --bg-app: #05080e;
  --surface-panel: #0b0f19;
  --surface-item: #131b2e;
  --border-line: rgba(255, 255, 255, 0.06);
  --text-main: #f3f6fa;
  --text-muted: #8e9cb2;
  --primary-accent: #02f3a2; /* Neon Mint */
  --primary-accent-glow: rgba(2, 243, 162, 0.15);
  --danger-accent: #fb7185; /* Neon Pink */
  
  --shadow-flat: 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-rise: 0 12px 40px rgba(0, 0, 0, 0.5);
}
```

### ✍️ B. Typography Hierarchies
* **Header Titles**: Bold, tracking-tight (`tracking-tight font-extrabold`) using `'Plus Jakarta Sans'`.
* **Money/Percentages/Balances**: Always apply class `font-numeric` (mapping to `'Outfit'`) with `tabular-nums` alignment to prevent visual text shifting during number updates.

---

## 🛠️ 4. Code Blueprints for Core Layout Panels

### 🗼 A. Screen-Adaptive Main Layout Frame
This wrapper expands to full viewport width, hiding the bottom bar on desktop and showing a sidebar navigation panel instead.

```tsx
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Wallet, ArrowLeftRight, Settings, Plus, Menu } from 'lucide-react'

export function AppLayout() {
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground transition-colors duration-300">
      {/* 1. Left Sidebar Nav (Desktop/Tablet Only) */}
      <aside className="hidden sm:flex flex-col w-20 lg:w-64 border-r border-border bg-surface shrink-0 p-4">
        {/* Logo Section */}
        <div className="flex items-center gap-3 px-2 py-4">
          <img src="/logo.svg" className="h-9 w-9 rounded-xl shadow-md" alt="Tracr" />
          <span className="hidden lg:block text-xl font-extrabold bg-gradient-to-r from-emerald-500 to-teal-400 bg-clip-text text-transparent">
            Tracr
          </span>
        </div>

        {/* Navigation Deck */}
        <nav className="flex-1 space-y-2 mt-8">
          <SidebarLink to="/" label="Dashboard" icon={LayoutDashboard} />
          <SidebarLink to="/accounts" label="Accounts" icon={Wallet} />
          <SidebarLink to="/transactions" label="Activity" icon={ArrowLeftRight} />
          <SidebarLink to="/settings" label="Settings" icon={Settings} />
        </nav>
      </aside>

      {/* 2. Main Area Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-surface flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-bold">Workspace</h2>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground hidden md:inline">Synced with Supabase</span>
            <div className="h-8 w-8 rounded-lg bg-surface-muted border border-border" />
          </div>
        </header>

        {/* Scrolling Main Body Grid */}
        <main className="flex-1 overflow-y-auto px-6 py-6 pb-28 sm:pb-6">
          <Outlet />
        </main>
      </div>

      {/* 3. Floating Bottom Bar (Mobile Only) */}
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md bg-surface/80 backdrop-blur-lg border border-border/80 rounded-full shadow-lg p-1.5 z-40 sm:hidden">
        <div className="grid grid-cols-5 items-center justify-items-center">
          <MobileNavLink to="/" label="Home" icon={LayoutDashboard} />
          <MobileNavLink to="/accounts" label="Accounts" icon={Wallet} />
          {/* Central elevated quick action */}
          <button className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md active:scale-95 transition-all">
            <Plus className="h-5 w-5" />
          </button>
          <MobileNavLink to="/transactions" label="Activity" icon={ArrowLeftRight} />
          <MobileNavLink to="/settings" label="Settings" icon={Settings} />
        </div>
      </nav>
    </div>
  )
}
```

---

## 📈 5. Visual Dashboard Configurations

### 📊 A. Spending Chart Spec (Avoiding Default Recharts Styling)
Default charts look like generic templates. Tracr requires a dark-tinted canvas with custom hover indicators:

1. **Defs for Gradient Fills**: Add linear gradients to the JSX template.
2. **Custom Tooltip Canvas**: Use glassmorphism overlays and shadows.
3. **Axis Lines**: Hide vertical grid lines entirely; keep only thin, dashed horizontal grid dividers.

```tsx
<ResponsiveContainer width="100%" height={240}>
  <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
    <defs>
      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.05} />
      </linearGradient>
    </defs>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
    <Tooltip 
      cursor={{ fill: 'var(--surface-muted)', opacity: 0.4, radius: 8 }} 
      contentStyle={{
        backgroundColor: 'var(--surface-panel)',
        borderColor: 'var(--border-line)',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-rise)',
      }} 
    />
    <Bar dataKey="spent" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

### 💳 B. Neobank Wallet Cards
Account representations must look like high-fidelity mini credit cards rather than generic list bullets. Arrange them in a responsive flex grid:

```tsx
// CSS styles for individual items in the Grid Deck:
className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-flat hover:shadow-rise transition-all duration-300 group cursor-pointer hover:-translate-y-0.5"
```
* **Visual Additions**: Integrate a card type tag (e.g., Credit, Cash, Savings) in a subtle font at the top-right.
* **Account indicator**: A horizontal color bar at the top edge of the card dynamically mapping to `account.color`.

---

## 🛠️ 6. Page Layout Layout Specifications

### 🏡 A. Dashboard (Wide Adaptivity)
* **Desktop ($>1024px$)**: Split into a 3-column layout. The Net Worth Card and Recharts Graph reside on the left (wide panel), while a sticky summary pane containing account balances sits on the right.
* **Mobile**: Standard stacked view.

### 💰 B. Account Wallet Interface
* **Desktop**: Grids display `grid-cols-2` or `grid-cols-3` to present multiple account metrics simultaneously.
* **Layout Structure**: Display a unified balance metric at the top-left, with a "Create Account" card container always positioned at the end of the grid.

### 🕵️ C. Activity Feed
* **Structure**: A top sticky search/filter panel grouped in a unified card block (`rounded-2xl`). Includes search query field, tag picker, and account selector.
* **Layout Grid**: Single layout column taking up maximum screen width for high row visibility. Show transaction notes, categories, tag chips, and sign displays side-by-side on wide screens.

---

## 🚀 7. Interactive Feedback & State Animations

Never transition states instantly. Use micro-animations to improve app responsiveness:
1. **Interactive Tap Effect**: Apply a tactile scale active effect to all clickable nodes:
   ```css
   .pressable:active {
     transform: scale(0.97);
     transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
   }
   ```
2. **Sheet Slide Animation**: Mobile drawers must slide up using:
   ```css
   @keyframes slideUp {
     from { transform: translateY(100%); }
     to { transform: translateY(0); }
   }
   .bottom-sheet {
     animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
   }
   ```
3. **Crossfades**: Page loads/route loads must crossfade smoothly:
   ```css
   .page-fade {
     animation: fadeIn 0.25s ease-out forwards;
   }
   ```
