import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Category } from '@kinsen/budget-domain'
import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'
import { CategoryIconField } from '../../shared/components/CategoryIcon'
import { AstryxSelectField, AstryxTextField } from '../../shared/components/AstryxFields'
import { Icon } from '../../shared/components/Icon'
import { newId } from '../../shared/format/id'
import { useBudgetStore } from '../../shared/state/budget-store'

const palette = ['#6C9A8B', '#D17B88', '#E9A23B', '#5D8AA8', '#9B7EBD', '#D6A756', '#547C66']

const newTypeSchema = z.object({
  name: z.string().trim().min(1, 'Name this type.').max(40, 'Keep names under 40 characters.'),
  icon: z.string(),
  defaultCadence: z.enum(['WEEKLY', 'MONTHLY']),
})
type NewTypeValues = z.infer<typeof newTypeSchema>

type NewRecurringTypeProps = {
  existingNames: readonly string[]
  /** Called with the saved category so the commitment form can select it. */
  onCreated: (category: Category) => void
}

/**
 * Inline "create a recurring type" panel. A recurring type is a scheduled, planned
 * category; it starts with a zero allocation so the budget's bucket totals still
 * add up, and can be funded later from Budget settings.
 */
export function NewRecurringType({ existingNames, onCreated }: NewRecurringTypeProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runMutation = useBudgetStore((state) => state.runMutation)
  const snapshot = useBudgetStore((state) => state.snapshot)
  const { control, handleSubmit, reset } = useForm<NewTypeValues>({
    resolver: zodResolver(newTypeSchema),
    defaultValues: { name: '', icon: '', defaultCadence: 'MONTHLY' },
  })

  const create = handleSubmit(async (values) => {
    setError(null)
    const name = values.name.trim()
    if (existingNames.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      setError('A category with this name already exists.')
      return
    }
    const category: Category = {
      id: newId('category'),
      name,
      mode: 'SCHEDULED',
      bucket: 'PLANNED',
      allocation: 0,
      color: palette[(snapshot?.categories.length ?? 0) % palette.length] ?? '#6C9A8B',
      ...(values.icon ? { icon: values.icon } : {}),
      defaultCadence: values.defaultCadence,
    }
    try {
      await runMutation((useCases) => useCases.addCategory(category))
      reset()
      setOpen(false)
      onCreated(category)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The type could not be saved.')
    }
  })

  if (!open) {
    return <Button label="New recurring type" type="button" variant="ghost" icon={<Icon name="plus" size={16} />} className="new-recurring-type-trigger" onClick={() => setOpen(true)} />
  }

  return (
    <Stack as="section" className="new-recurring-type" aria-label="New recurring type" direction="vertical" gap={3}>
      <AstryxTextField control={control} name="name" label="Type name" autoComplete="off" maxLength={40} className="field" />
      <AstryxSelectField control={control} name="defaultCadence" label="Default repeat" options={[{ value: 'MONTHLY', label: 'Monthly' }, { value: 'WEEKLY', label: 'Weekly' }]} className="field" />
      <CategoryIconField control={control} name="icon" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <Stack direction="horizontal" gap={2} justify="end">
        <Button label="Cancel" type="button" variant="ghost" className="button button-outline" onClick={() => { reset(); setError(null); setOpen(false) }} />
        <Button label="Add type" type="button" variant="secondary" className="button button-secondary" onClick={() => void create()} />
      </Stack>
    </Stack>
  )
}
