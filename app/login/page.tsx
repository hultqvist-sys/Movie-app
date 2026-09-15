import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default function LoginPage() {
  const login = async (formData: FormData) => {
    "use server"
    
    const email = formData.get("email") as string
    const password = formData.get("password") as string
    const supabase = createClient()
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      return redirect("/login?message=Could not authenticate user")
    }
    
    return redirect("/")
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form className="w-full max-w-sm space-y-4" action={login}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        <Button type="submit" className="w-full">
          Sign In
        </Button>
      </form>
    </div>
  )
}