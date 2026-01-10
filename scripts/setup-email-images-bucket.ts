import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupEmailImagesBucket() {
  console.log('Setting up email-images storage bucket...\n')

  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()

  if (listError) {
    console.error('Error listing buckets:', listError)
    return
  }

  const existingBucket = buckets?.find(b => b.name === 'email-images')

  if (existingBucket) {
    console.log('Bucket "email-images" already exists')
    console.log('  ID:', existingBucket.id)
    console.log('  Public:', existingBucket.public)

    // If not public, update it
    if (!existingBucket.public) {
      console.log('\nBucket is not public. Updating...')
      const { error: updateError } = await supabase.storage.updateBucket('email-images', {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        fileSizeLimit: 5 * 1024 * 1024, // 5MB
      })

      if (updateError) {
        console.error('Error updating bucket:', updateError)
      } else {
        console.log('Bucket updated to public!')
      }
    }
  } else {
    console.log('Creating bucket "email-images"...')
    const { data, error: createError } = await supabase.storage.createBucket('email-images', {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      fileSizeLimit: 5 * 1024 * 1024, // 5MB
    })

    if (createError) {
      console.error('Error creating bucket:', createError)
    } else {
      console.log('Bucket created successfully!')
      console.log('  Name:', data.name)
    }
  }

  // Test by listing files
  console.log('\nListing files in bucket...')
  const { data: files, error: filesError } = await supabase.storage
    .from('email-images')
    .list('', { limit: 10 })

  if (filesError) {
    console.error('Error listing files:', filesError)
  } else {
    console.log(`Found ${files?.length || 0} files in bucket`)
    files?.forEach(f => {
      const { data: urlData } = supabase.storage
        .from('email-images')
        .getPublicUrl(f.name)
      console.log(`  - ${f.name}: ${urlData.publicUrl}`)
    })
  }

  console.log('\nDone!')
}

setupEmailImagesBucket()
