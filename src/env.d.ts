/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    resident: import('@/types/domain').ResidentSession | null;
    admin: import('@/types/domain').AdminSession | null;
  }
}
