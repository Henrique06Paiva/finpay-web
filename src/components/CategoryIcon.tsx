import React from 'react';
import {
  ArrowLeftRight,
  Baby,
  Briefcase,
  Car,
  Coffee,
  Dumbbell,
  Fuel,
  Gift,
  GraduationCap,
  Heart,
  HeartPulse,
  Home,
  Laptop,
  MoreHorizontal,
  PawPrint,
  Plane,
  PlusCircle,
  Receipt,
  Repeat,
  RotateCcw,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Target,
  Ticket,
  TrendingUp,
  Utensils,
  Wallet,
  Zap,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Home,
  Zap,
  ShoppingCart,
  Utensils,
  Coffee,
  Car,
  Fuel,
  HeartPulse,
  Dumbbell,
  GraduationCap,
  Ticket,
  ShoppingBag,
  Shirt,
  Repeat,
  Smartphone,
  PawPrint,
  Baby,
  Plane,
  Receipt,
  Gift,
  Briefcase,
  Laptop,
  TrendingUp,
  Wallet,
  RotateCcw,
  PlusCircle,
  ShieldCheck,
  Heart,
  Target,
  ArrowLeftRight,
  MoreHorizontal,
};

export const CategoryIcon: React.FC<{
  name?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ name = 'MoreHorizontal', className = 'w-4 h-4', style }) => {
  const Comp = ICON_MAP[name] || MoreHorizontal;
  return <Comp className={className} style={style} />;
};
