import {
  Activity, AirVent, AlarmClock, Armchair, Bath, Battery, Bed, Bell, Blinds,
  Bot, Box, Briefcase, Building2, Camera, Car, Cctv, ChefHat, CircleGauge,
  Cloud, Coffee, CookingPot, DoorClosed, DoorOpen, Droplets, Dumbbell, Fan,
  Fence, Film, Flame, Flower2, Gamepad2, Heater, Home, House, KeyRound, Lamp,
  LampCeiling, Laptop, Layers, Leaf, Lightbulb, Lock, Microwave, Monitor, Moon,
  Music, Package, PawPrint, Plug, Power, Refrigerator, Router, Shield,
  ShowerHead, Snowflake, Sofa, Sparkles, Sprout, SquarePower, Star, Sun,
  Sunrise, Thermometer, TreePine, Trees, Tv, Umbrella, Utensils, UtilityPole,
  Video, Volume2, Warehouse, WashingMachine, Waves, Wind, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Curated home icon catalog. Importing Lucide's runtime `icons` registry pulled
 * every glyph into the kiosk entry chunk; this explicit map remains flexible
 * for household labels while allowing the bundler to tree-shake the rest.
 */
const ICONS: Record<string, LucideIcon> = {
  Activity, AirVent, AlarmClock, Armchair, Bath, Battery, Bed, Bell, Blinds,
  Bot, Box, Briefcase, Building2, Camera, Car, Cctv, ChefHat, CircleGauge,
  Cloud, Coffee, CookingPot, DoorClosed, DoorOpen, Droplets, Dumbbell, Fan,
  Fence, Film, Flame, Flower2, Gamepad2, Heater, Home, House, KeyRound, Lamp,
  LampCeiling, Laptop, Layers, Leaf, Lightbulb, Lock, Microwave, Monitor, Moon,
  Music, Package, PawPrint, Plug, Power, Refrigerator, Router, Shield,
  ShowerHead, Snowflake, Sofa, Sparkles, Sprout, SquarePower, Star, Sun,
  Sunrise, Thermometer, TreePine, Trees, Tv, Umbrella, Utensils, UtilityPole,
  Video, Volume2, Warehouse, WashingMachine, Waves, Wind, Wrench, Zap,
}

function iconKey(name: string): string {
  return name
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

export function lucideIcon(name?: string): LucideIcon | undefined {
  return name ? ICONS[name] ?? ICONS[iconKey(name)] : undefined
}

export function iconExists(name?: string): boolean {
  return Boolean(lucideIcon(name))
}

export const availableIconNames = Object.keys(ICONS)
  .map((name) => name.replace(/[A-Z]/g, (letter, index) => `${index ? '-' : ''}${letter.toLowerCase()}`))
  .sort()
