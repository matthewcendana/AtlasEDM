// Thin re-export: the filter bar's trigger+dropdown shell was fully generic already,
// so it now lives at ui/PopoverPanel (reusable outside the filter bar too) and this
// file just keeps the filter bar's existing import path/name working unchanged.
export { PopoverPanel as FilterPopoverButton } from "../../_components/ui/PopoverPanel";
