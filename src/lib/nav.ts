// Single source of truth for the SEO King-style menus.
// Each item maps to /<section>/<slug>. Built so we can drop in real
// implementations under src/app/(app)/<section>/<slug>/page.tsx as we go.

import {
  Activity,
  AlertCircle,
  Boxes,
  Brain,
  CheckSquare,
  ClipboardList,
  Code2,
  Cpu,
  Database,
  Eye,
  FileCode,
  FileImage,
  FileSearch,
  FileText,
  Files,
  Globe,
  Image as ImageIcon,
  ImageOff,
  KeyRound,
  Languages,
  Layers,
  Layout,
  LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Lock,
  MessageSquare,
  Palette,
  Replace,
  Rocket,
  Search,
  Settings as SettingsIcon,
  ShoppingBag,
  Sparkles,
  Tag,
  Tags,
  TrendingUp,
  Wand2,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  slug: string; // url segment
  title: string;
  description: string;
  icon: LucideIcon;
  premium?: boolean;
};

export type NavSection = {
  slug: string;
  title: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const NAV: NavSection[] = [
  {
    slug: "analytics",
    title: "Analytics",
    icon: Activity,
    items: [
      {
        slug: "checklist",
        title: "SEO Checklist",
        description: "At-a-glance health checks for your store.",
        icon: ListChecks,
      },
      {
        slug: "dashboard",
        title: "SEO Dashboard",
        description: "Headline metrics: pages, images, CTR, clicks.",
        icon: Layout,
      },
      {
        slug: "core-web-vitals",
        title: "Core Web Vitals",
        description: "LCP / CLS / INP for your live store.",
        icon: TrendingUp,
        premium: true,
      },
      {
        slug: "scan",
        title: "Scan",
        description: "Crawl every page and image and grade them.",
        icon: Search,
      },
      {
        slug: "scan-issues",
        title: "Scan Issues",
        description: "All issues found by the latest scan.",
        icon: AlertCircle,
      },
      {
        slug: "scan-logs",
        title: "Scan Logs",
        description: "History of every scan and what changed.",
        icon: ClipboardList,
      },
      {
        slug: "google-search",
        title: "Google Search",
        description: "Clicks / impressions / CTR from Search Console.",
        icon: Globe,
      },
      {
        slug: "keywords",
        title: "Keywords",
        description: "Track which keywords your pages rank for.",
        icon: KeyRound,
      },
      {
        slug: "page-tracker",
        title: "Page Tracker",
        description: "Watch specific pages over time.",
        icon: Eye,
      },
      {
        slug: "serp-rankings",
        title: "SERP Rankings",
        description: "Position tracking for chosen keywords.",
        icon: ListOrdered,
      },
    ],
  },
  {
    slug: "ai",
    title: "AI",
    icon: Brain,
    items: [
      {
        slug: "settings",
        title: "AI Settings & Rules",
        description: "Brand voice, tone, do/don't rules for the AI.",
        icon: SettingsIcon,
      },
      {
        slug: "premium",
        title: "Premium AI Services",
        description: "Heavier AI ops (vision, batch rewrites).",
        icon: Sparkles,
      },
      {
        slug: "mcp",
        title: "MCP Integration",
        description: "Expose your store to Claude via MCP.",
        icon: Cpu,
      },
      {
        slug: "vision",
        title: "Vision AI",
        description: "Use Claude vision to describe product photos.",
        icon: Eye,
      },
    ],
  },
  {
    slug: "optimize",
    title: "Optimize",
    icon: Wand2,
    items: [
      {
        slug: "all",
        title: "Optimize All",
        description: "Run every optimizer in one shot.",
        icon: Rocket,
      },
      {
        slug: "settings",
        title: "Optimizer Settings",
        description: "Defaults for every optimizer.",
        icon: SettingsIcon,
      },
      {
        slug: "skip-pages",
        title: "Skip Pages",
        description: "Patterns to exclude from optimization.",
        icon: ImageOff,
      },
      {
        slug: "meta-titles",
        title: "Meta Titles",
        description: "Bulk generate / edit page titles.",
        icon: FileText,
      },
      {
        slug: "photo-filenames",
        title: "Photo Filenames",
        description: "Rename images to SEO-friendly slugs.",
        icon: FileImage,
      },
      {
        slug: "alt-texts",
        title: "Alt Texts",
        description: "Bulk auto-write alt text for every image.",
        icon: ImageIcon,
      },
      {
        slug: "theme-images",
        title: "Theme Images",
        description: "Optimize images uploaded into the theme.",
        icon: Palette,
      },
      {
        slug: "json-ld",
        title: "JSON-LD",
        description: "Inject structured data for products / breadcrumbs.",
        icon: Code2,
      },
      {
        slug: "titles",
        title: "Titles",
        description: "Product / collection / page H1 cleanup.",
        icon: FileText,
      },
      {
        slug: "main-html-text",
        title: "Main HTML Text",
        description: "Rewrite product descriptions for SEO.",
        icon: FileCode,
      },
      {
        slug: "translations",
        title: "Translations",
        description: "Translate SEO fields into other languages.",
        icon: Languages,
      },
      {
        slug: "meta-descriptions",
        title: "Meta Descriptions",
        description: "Bulk generate / edit meta descriptions.",
        icon: FileText,
      },
      {
        slug: "urls",
        title: "URLs",
        description: "Suggest / fix product handles for SEO.",
        icon: LinkIcon,
      },
    ],
  },
  {
    slug: "products",
    title: "Products",
    icon: Boxes,
    items: [
      {
        slug: "export-photos",
        title: "Export Photos",
        description: "Download all product images.",
        icon: ImageIcon,
      },
      {
        slug: "google-shopping",
        title: "Google Shopping",
        description: "Generate a Google Merchant feed.",
        icon: ShoppingBag,
      },
      {
        slug: "json-ld-faq",
        title: "JSON-LD FAQ",
        description: "Inject FAQ structured data on products.",
        icon: MessageSquare,
      },
      {
        slug: "low-resolution-photos",
        title: "Low Resolution Photos",
        description: "Find product images that are too small.",
        icon: FileSearch,
      },
      {
        slug: "photo-editor",
        title: "Photo Editor",
        description: "Crop / brighten / sharpen product images.",
        icon: ImageIcon,
      },
      {
        slug: "remove-backgrounds",
        title: "Remove Backgrounds",
        description: "AI background removal for product photos.",
        icon: Sparkles,
      },
      {
        slug: "tags",
        title: "Tags",
        description: "Bulk edit product tags.",
        icon: Tags,
      },
    ],
  },
  {
    slug: "tools",
    title: "Tools",
    icon: Wrench,
    items: [
      {
        slug: "404-errors",
        title: "404 Errors",
        description: "Find pages that 404 on your store.",
        icon: AlertCircle,
      },
      {
        slug: "assets-folder",
        title: "Assets Folder",
        description: "Browse files in your theme assets.",
        icon: Files,
      },
      {
        slug: "backlinks",
        title: "Backlinks",
        description: "Inbound links pointing to your store.",
        icon: LinkIcon,
        premium: true,
      },
      {
        slug: "broken-links",
        title: "Broken Links",
        description: "Internal & outbound links that are dead.",
        icon: AlertCircle,
      },
      {
        slug: "code-optimizer",
        title: "Code Optimizer",
        description: "Inline / minify / preload helpers.",
        icon: Code2,
        premium: true,
      },
      {
        slug: "compress-photos",
        title: "Compress Photos",
        description: "Re-compress product images to save bytes.",
        icon: ImageIcon,
      },
      {
        slug: "disable-right-click",
        title: "Disable Right Click",
        description: "Block right-click on storefront pages.",
        icon: Lock,
      },
      {
        slug: "image-editor",
        title: "Image Editor (Files)",
        description: "Edit images stored in Shopify Files.",
        icon: ImageIcon,
      },
      {
        slug: "llms-txt",
        title: "LLMs.txt",
        description: "Generate an llms.txt for your store.",
        icon: Brain,
        premium: true,
      },
      {
        slug: "no-index",
        title: "No-Index",
        description: "Mark pages as noindex.",
        icon: Lock,
      },
      {
        slug: "redirects",
        title: "Redirects",
        description: "Manage 301 redirects.",
        icon: Replace,
      },
      {
        slug: "referrer-tracking",
        title: "Referrer Tracking",
        description: "Where your visitors come from.",
        icon: TrendingUp,
        premium: true,
      },
      {
        slug: "robots-txt",
        title: "Robots.txt",
        description: "Edit your robots.txt rules.",
        icon: FileText,
      },
      {
        slug: "seo-editor",
        title: "SEO Editor",
        description: "Inline edit any page's SEO fields.",
        icon: FileText,
      },
      {
        slug: "search-and-replace",
        title: "Search and Replace",
        description: "Find & replace text across products.",
        icon: Replace,
        premium: true,
      },
      {
        slug: "sitemaps",
        title: "Sitemaps",
        description: "Inspect & extend your sitemap.xml.",
        icon: List,
      },
    ],
  },
];

export function findItem(section: string, slug: string): NavItem | undefined {
  return NAV.find((s) => s.slug === section)?.items.find(
    (i) => i.slug === slug,
  );
}

export function findSection(section: string): NavSection | undefined {
  return NAV.find((s) => s.slug === section);
}
