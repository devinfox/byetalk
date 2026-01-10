import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function clearAllTasks() {
  console.log('=== Clearing all tasks from database ===\n')

  // Get count first
  const { count: totalCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })

  console.log('Total tasks to delete:', totalCount || 0)

  // Delete all tasks
  const { error } = await supabase
    .from('tasks')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

  if (error) {
    console.log('Error deleting tasks:', error.message)
  } else {
    console.log('✅ All tasks deleted successfully!')
  }

  // Also clear ai_tasks if they exist
  const { count: aiCount } = await supabase
    .from('ai_tasks')
    .select('*', { count: 'exact', head: true })

  console.log('Total AI tasks to delete:', aiCount || 0)

  const { error: aiError } = await supabase
    .from('ai_tasks')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (aiError) {
    console.log('AI tasks error:', aiError.message)
  } else {
    console.log('✅ All AI tasks deleted successfully!')
  }

  console.log('\n=== Task cleanup complete! ===')
}

clearAllTasks().catch(console.error)
