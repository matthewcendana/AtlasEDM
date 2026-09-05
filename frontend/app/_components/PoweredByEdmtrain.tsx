import Image from "next/image";
import edmtrainLogo from "../_assets/edmtrain-logo.png";

export function PoweredByEdmtrain() {
  return (
    <a
      href="https://edmtrain.com/"
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-fit items-center gap-2 text-base text-text-secondary transition-colors hover:text-text-primary"
    >
      <span>Powered by Edmtrain</span>
      <Image src={edmtrainLogo} alt="" className="h-5 w-auto" />
    </a>
  );
}
