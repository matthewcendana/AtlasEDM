import Image from "next/image";
import edmtrainLogo from "../_assets/edmtrain-logo.png";

export function PoweredByEdmtrain() {
  return (
    <div className="flex items-center gap-2 text-sm text-text-secondary">
      <span>Powered by Edmtrain</span>
      <Image src={edmtrainLogo} alt="" className="h-4 w-auto" />
    </div>
  );
}
