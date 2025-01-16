import Spinner from "../assets/icons/ic_spinner.svg";

type Props = {
  progress: number;
};

export default function Loading({ progress }: Props) {
  return (
    <div className="relative w-full h-full grid place-items-center">
      <div className="w-fit h-fit relative">
        <Spinner className="animate-spin" />
        <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2">{progress.toFixed()}%</div>
      </div>
    </div>
  );
}
