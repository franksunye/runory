export interface LoadingStateProps {
  variant: "table" | "form" | "page" | "detail";
  rows?: number;
  columns?: number;
}

function TableSkeleton({
  rows = 6,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="app-card overflow-hidden p-0">
      <div className="space-y-2 p-4">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div key={colIndex} className="app-skeleton h-10 min-w-0 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <div key={sectionIndex} className="app-card p-6">
          <div className="app-skeleton mb-4 h-5 w-40" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, fieldIndex) => (
              <div key={fieldIndex} className="space-y-2">
                <div className="app-skeleton h-3 w-24" />
                <div className="app-skeleton h-11 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PageSkeleton({
  rows,
  columns,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="app-skeleton h-3 w-28" />
          <div className="app-skeleton h-8 w-56" />
        </div>
        <div className="app-skeleton h-10 w-32 rounded-lg" />
      </div>
      <TableSkeleton rows={rows} columns={columns} />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="app-card p-6">
        <div className="flex items-center gap-4">
          <div className="app-skeleton h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <div className="app-skeleton h-4 w-48" />
            <div className="app-skeleton h-3 w-32" />
          </div>
        </div>
      </div>
      <div className="app-card p-6">
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, rowIndex) => (
            <div key={rowIndex} className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, fieldIndex) => (
                <div key={fieldIndex} className="space-y-2">
                  <div className="app-skeleton h-3 w-20" />
                  <div className="app-skeleton h-4 w-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LoadingState({
  variant,
  rows,
  columns,
}: LoadingStateProps) {
  let content: React.ReactNode = null;

  switch (variant) {
    case "table":
      content = <TableSkeleton rows={rows} columns={columns} />;
      break;
    case "form":
      content = <FormSkeleton />;
      break;
    case "page":
      content = <PageSkeleton rows={rows} columns={columns} />;
      break;
    case "detail":
      content = <DetailSkeleton />;
      break;
  }

  return (
    <div aria-busy="true">
      {content}
    </div>
  );
}

export default LoadingState;
