diff --git a/frontend/src/app/login/page.tsx b/frontend/src/app/login/page.tsx
index 000000..000000 100644
--- a/frontend/src/app/login/page.tsx
+++ b/frontend/src/app/login/page.tsx
@@
   const handleSubmit = async (e: React.FormEvent) => {
@@
   }
+
+  const handleGoogle = async () => {
+    try {
+      const res = await fetch('/api/auth/google/redirect')
+      const data = await res.json()
+      if (data.url) {
+        window.location.href = data.url
+      }
+    } catch (err) {
+      console.error('Google redirect failed', err)
+    }
+  }
@@
             <button
               type="submit"
               disabled={loading}
               className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
             >
               {loading ? 'Signing in…' : 'Sign in'}
             </button>
+
+            <div className="mt-3">
+              <button onClick={handleGoogle} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm hover:bg-gray-50">
+                Continue with Google
+              </button>
+            </div>
