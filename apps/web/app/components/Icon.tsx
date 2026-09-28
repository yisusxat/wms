import React from "react";
import {
  LayoutDashboard,
  Gauge,
  FileBarChart,
  Package,
  MapPin,
  Boxes,
  ArrowLeftRight,
  Box,
  Grid3X3,
  ScanSearch,
  Users,
  ScanBarcode,
  ScanLine,
  ScrollText,
  ShieldCheck,
  LifeBuoy,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Scale,
  LogOut,
  Search,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Check,
  AlertTriangle,
  Plus,
  Download,
  Upload,
  Printer,
  RefreshCw,
  Sliders,
  Sparkles,
  Camera,
  Keyboard,
  Eye,
  Radio,
  User,
  Info,
  Layers,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Trash2,
  Edit,
  ExternalLink,
  Smartphone,
  Copy,
  FolderOpen,
  Filter,
  Truck,
  ArrowDownLeft,
  EyeOff,
  Focus,
  Crosshair,
  LucideProps,
} from "lucide-react";

export type IconName =
  | "dashboard"
  | "kpis"
  | "reports"
  | "products"
  | "locations"
  | "inventory"
  | "boxes"
  | "movements"
  | "warehouse3d"
  | "warehouse2d"
  | "mapping"
  | "team"
  | "scan"
  | "scan-barcode"
  | "scan-line"
  | "audit"
  | "security-2fa"
  | "support"
  | "legal"
  | "volume-on"
  | "volume-off"
  | "sun"
  | "moon"
  | "logout"
  | "search"
  | "menu"
  | "close"
  | "chevron-down"
  | "chevron-right"
  | "check"
  | "warning"
  | "plus"
  | "download"
  | "upload"
  | "print"
  | "refresh"
  | "sliders"
  | "sparkles"
  | "camera"
  | "keyboard"
  | "ocr"
  | "radio"
  | "user"
  | "info"
  | "layers"
  | "arrow-right"
  | "clock"
  | "check-circle"
  | "x-circle"
  | "help"
  | "trash"
  | "edit"
  | "external-link"
  | "smartphone"
  | "copy"
  | "folder"
  | "filter"
  | "bar-chart-2"
  | "truck"
  | "alert-triangle"
  | "printer"
  | "layout-dashboard"
  | "table"
  | "map"
  | "map-pin"
  | "arrow-down-left"
  | "arrow-left-right"
  | "package"
  | "eye-off"
  | "eye"
  | "focus"
  | "crosshair";

const iconMap: Record<IconName, React.ComponentType<LucideProps>> = {
  dashboard: LayoutDashboard,
  kpis: Gauge,
  reports: FileBarChart,
  products: Package,
  locations: MapPin,
  inventory: Boxes,
  boxes: Boxes,
  movements: ArrowLeftRight,
  warehouse3d: Box,
  warehouse2d: Grid3X3,
  mapping: ScanSearch,
  team: Users,
  scan: ScanBarcode,
  "scan-barcode": ScanBarcode,
  "scan-line": ScanLine,
  audit: ScrollText,
  "security-2fa": ShieldCheck,
  support: LifeBuoy,
  legal: Scale,
  "volume-on": Volume2,
  "volume-off": VolumeX,
  sun: Sun,
  moon: Moon,
  logout: LogOut,
  search: Search,
  menu: Menu,
  close: X,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  check: Check,
  warning: AlertTriangle,
  plus: Plus,
  download: Download,
  upload: Upload,
  print: Printer,
  refresh: RefreshCw,
  sliders: Sliders,
  sparkles: Sparkles,
  camera: Camera,
  keyboard: Keyboard,
  ocr: Eye,
  radio: Radio,
  user: User,
  info: Info,
  layers: Layers,
  "arrow-right": ArrowRight,
  clock: Clock,
  "check-circle": CheckCircle2,
  "x-circle": XCircle,
  help: HelpCircle,
  trash: Trash2,
  edit: Edit,
  "external-link": ExternalLink,
  smartphone: Smartphone,
  copy: Copy,
  folder: FolderOpen,
  filter: Filter,
  "bar-chart-2": FileBarChart,
  truck: Truck,
  "alert-triangle": AlertTriangle,
  printer: Printer,
  "layout-dashboard": LayoutDashboard,
  table: Grid3X3,
  map: MapPin,
  "map-pin": MapPin,
  "arrow-down-left": ArrowDownLeft,
  "arrow-left-right": ArrowLeftRight,
  package: Package,
  "eye-off": EyeOff,
  eye: Eye,
  focus: Focus,
  crosshair: Crosshair,
};

export interface IconProps extends LucideProps {
  name: IconName;
  size?: number | string;
  strokeWidth?: number;
  className?: string;
}

export function Icon({
  name,
  size = 18,
  strokeWidth = 2,
  className = "",
  ...props
}: IconProps) {
  const Component = iconMap[name] || HelpCircle;
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      className={`shrink-0 inline-block align-middle transition-colors ${className}`}
      {...props}
    />
  );
}

export default Icon;
