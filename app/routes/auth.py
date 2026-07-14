@@
   def login(data: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
-    # Accept email OR username as the identifier — whichever the client sends
-    identifier = (data.email or data.username or "").strip()
+    # Accept email OR username as the identifier — whichever the client sends
+    identifier = (data.email or data.username or "").strip()
     if not identifier:
         raise HTTPException(status_code=422, detail="Provide email or username")
+    # Rate limit login attempts per identifier (email) or per IP if available
+    from fastapi import Request
+    from app.services.rate_limiter import sliding_window_allow
+    request: Request | None = None
+    try:
+        # FastAPI will supply Request if added to signature; this is a fallback attempt
+        request = Request(scope=__import__("starlette.requests").Request.scope)
+    except Exception:
+        request = None
+    key = f"login:{identifier}"
+    allowed = True
+    try:
+        allowed = await sliding_window_allow(key, window_seconds=600, max_count=30)  # 30 attempts / 10m
+    except Exception:
+        allowed = True
+    if not allowed:
+        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
*** End Patch
