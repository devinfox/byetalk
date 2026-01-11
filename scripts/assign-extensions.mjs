#!/usr/bin/env node

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load environment variables
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function assignExtensions() {
  console.log('Fetching citadelgold.com users...\n')

  // Get all citadelgold.com users ordered by creation date
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, first_name, last_name, extension, created_at')
    .ilike('email', '%@citadelgold.com')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching users:', error)
    process.exit(1)
  }

  console.log(`Found ${users.length} citadelgold.com user(s)\n`)

  if (users.length === 0) {
    console.log('No users to update.')
    return
  }

  // Assign extensions starting from 1
  let extension = 1

  for (const user of users) {
    console.log(`${user.first_name} ${user.last_name} (${user.email})`)
    console.log(`  Current extension: ${user.extension || 'none'}`)
    console.log(`  Assigning extension: ${extension}`)

    const { error: updateError } = await supabase
      .from('users')
      .update({ extension: extension })
      .eq('id', user.id)

    if (updateError) {
      console.error(`  ✗ Failed: ${updateError.message}\n`)
    } else {
      console.log(`  ✓ Done\n`)
    }

    extension++
  }

  console.log('All extensions assigned!')
}

assignExtensions()
