type Props = {
  error?: any;
};

export default function Error({ error }: Props) {
  return <div className="w-full h-full flex items-center justify-center text-center bg-achid-gray">{error?.toString()}</div>;
}
