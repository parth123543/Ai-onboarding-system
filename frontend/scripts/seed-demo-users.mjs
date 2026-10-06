// Seed demo users into Supabase using the service role (admin) key
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jatwectygsnzpmfdrlog.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY || "dummy_key", {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_USERS = [
  {
    email: "sarah.chen@contoso.com",
    password: "Password123!",
    full_name: "Sarah Chen",
    phone: "+14255550199",
    role: "Software Engineer",
    work_location: "Redmond, WA",
    department: "Engineering",
    is_admin: false,
  },
  {
    email: "james.wilson@contoso.com",
    password: "Password123!",
    full_name: "James Wilson",
    phone: "+14255550200",
    role: "Product Manager",
    work_location: "Seattle, WA",
    department: "Product",
    is_admin: false,
  },
  {
    email: "priya.sharma@contoso.com",
    password: "Password123!",
    full_name: "Priya Sharma",
    phone: "+919876543210",
    role: "Data Scientist",
    work_location: "Bangalore, India",
    department: "AI & Research",
    is_admin: false,
  },
  {
    email: "emily.rogers@contoso.com",
    password: "Password123!",
    full_name: "Emily Rogers",
    phone: "+442071234567",
    role: "Solutions Architect",
    work_location: "London, UK",
    department: "Engineering",
    is_admin: false,
  },
  {
    email: "admin@contoso.com",
    password: "Admin123!",
    full_name: "HR Admin",
    phone: "+14255550300",
    role: "HR Specialist",
    work_location: "Redmond, WA",
    department: "Human Resources",
    is_admin: true,
  },
];

async function seed() {
  console.log("🚀 Seeding demo users into Supabase...\n");

  for (const u of DEMO_USERS) {
    // 1. Create auth user (admin API skips email confirmation)
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true, // auto-confirm so they can log in immediately
        user_metadata: {
          full_name: u.full_name,
          phone: u.phone,
          role: u.role,
          work_location: u.work_location,
          department: u.department,
          is_admin: u.is_admin,
        },
      });

    if (authError) {
      if (authError.message?.includes("already been registered")) {
        console.log(`⚠️  ${u.email} — already exists, skipping auth creation`);
        // Still upsert the profile in case it's missing
        const { data: existingUsers } = await admin.auth.admin.listUsers();
        const existing = existingUsers?.users?.find((eu) => eu.email === u.email);
        if (existing) {
          await upsertProfile(existing.id, u);
        }
        continue;
      }
      console.error(`❌ ${u.email} — auth error: ${authError.message}`);
      continue;
    }

    const userId = authData.user.id;

    // 2. Upsert profile row (the trigger may have already created it)
    await upsertProfile(userId, u);

    console.log(
      `✅ ${u.full_name.padEnd(16)} | ${u.email.padEnd(28)} | ${u.role.padEnd(22)} | ${u.is_admin ? "★ ADMIN" : "Employee"}`
    );
  }

  console.log("\n────────────────────────────────────────────────");
  console.log("🎉 Demo users seeded! Login credentials:\n");
  for (const u of DEMO_USERS) {
    console.log(`   ${u.email}  /  ${u.password}`);
  }
  console.log("\n────────────────────────────────────────────────");
}

async function upsertProfile(userId, u) {
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: u.full_name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      work_location: u.work_location,
      department: u.department,
      is_admin: u.is_admin,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    console.error(`   ⚠️  Profile upsert failed for ${u.email}: ${profileError.message}`);
  }
}

seed().catch(console.error);
