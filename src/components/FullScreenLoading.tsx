interface FullScreenLoadingProps {
  message?: string;
}

export function FullScreenLoading({ message = "로그인 정보를 확인하고 있습니다..." }: FullScreenLoadingProps) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#101419] px-6 text-center" role="status">
      <div>
        <span className="mx-auto mb-5 block size-10 animate-spin border-4 border-[#26313b] border-t-[#48d7e8]" />
        <p className="font-mono text-sm font-bold text-[#f4f7f9]">{message}</p>
      </div>
    </div>
  );
}