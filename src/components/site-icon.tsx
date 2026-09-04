import {
  Accessibility,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  ChartNoAxesColumnIncreasing,
  ChartNoAxesCombined,
  Circle,
  CircleCheck,
  Columns2,
  Database,
  DoorOpen,
  Download,
  ExternalLink,
  GitBranch,
  HardHat,
  Info,
  LayoutDashboard,
  LocateFixed,
  Map,
  MapPin,
  MapPinX,
  Menu,
  MoveUpRight,
  RefreshCw,
  Route,
  Search,
  SearchX,
  Settings,
  ShieldCheck,
  TrainFront,
  TriangleAlert,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

type SiteIconProps = {
  className?: string;
  name: string;
};

const icons: Record<string, LucideIcon> = {
  account_tree: GitBranch,
  accessible: Accessibility,
  alt_route: GitBranch,
  arrow_back: ArrowLeft,
  arrow_forward: ArrowRight,
  build: Wrench,
  check_circle: CircleCheck,
  close: X,
  construction: HardHat,
  database: Database,
  door_open: DoorOpen,
  download: Download,
  elevator: ArrowUpDown,
  engineering: Wrench,
  escalator: MoveUpRight,
  event: Info,
  event_available: CircleCheck,
  expand_more: ArrowUpDown,
  groups: Users,
  health_and_safety: ShieldCheck,
  history: RefreshCw,
  info: Info,
  location_on: MapPin,
  map: Map,
  menu: Menu,
  monitoring: ChartNoAxesColumnIncreasing,
  my_location: LocateFixed,
  open_in_new: ExternalLink,
  payments: Database,
  percent: ChartNoAxesColumnIncreasing,
  query_stats: ChartNoAxesCombined,
  search: Search,
  search_off: SearchX,
  settings: Settings,
  space_dashboard: LayoutDashboard,
  split_view: Columns2,
  subway: TrainFront,
  sync: RefreshCw,
  timeline: ChartNoAxesColumnIncreasing,
  update: RefreshCw,
  warning: TriangleAlert,
  wrong_location: MapPinX,
  route: Route,
};

export function SiteIcon({ className = "", name }: SiteIconProps) {
  const Icon = icons[name] ?? Circle;

  return (
    <Icon
      aria-hidden="true"
      className={["inline-block h-[1em] w-[1em] shrink-0", className].join(" ")}
      strokeWidth={1.9}
    />
  );
}
