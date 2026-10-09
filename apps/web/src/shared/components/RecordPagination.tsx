import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'

export const RECORD_PAGE_SIZE = 50

type RecordPaginationProps = {
  count: number
  page: number
  onPageChange: (page: number) => void
}

export function RecordPagination({ count, page, onPageChange }: RecordPaginationProps) {
  const pageCount = Math.ceil(count / RECORD_PAGE_SIZE)
  if (pageCount < 2) return null

  const currentPage = Math.min(Math.max(page, 1), pageCount)
  const firstRecord = (currentPage - 1) * RECORD_PAGE_SIZE + 1
  const lastRecord = Math.min(currentPage * RECORD_PAGE_SIZE, count)

  return (
    <Stack as="nav" direction="horizontal" vAlign="center" gap={2} className="record-pagination" aria-label="Record pages">
      <Button
        label="Previous"
        className="button button-outline record-pagination-button"
        variant="secondary"
        type="button"
        aria-label="Previous records"
        isDisabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
      />
      <span className="record-pagination-range" aria-live="polite" aria-atomic="true">
        Showing {firstRecord}–{lastRecord} of {count}
      </span>
      <Button
        label="Next"
        className="button button-outline record-pagination-button"
        variant="secondary"
        type="button"
        aria-label="Next records"
        isDisabled={currentPage === pageCount}
        onClick={() => onPageChange(currentPage + 1)}
      />
    </Stack>
  )
}
