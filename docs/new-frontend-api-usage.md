# New Frontend API Usage

This document provides a complete list of every backend request made by the frontend components. It serves as an audit of the current API surface expected by the UI.

## 1. Get Pricing by Country
Used by `BillingPage.tsx` and `PricingSection.tsx` to dynamically fetch the monthly/annual prices for available plans in a specific region.

- **METHOD:** `GET`
- **PATH:** `/api/pricing/:country` (e.g. `/api/pricing/US`)
- **REQUEST BODY:** None
- **HEADERS:** None
- **AUTHENTICATION:** None (Public)
- **EXPECTED RESPONSE:**
  ```json
  {
    "success": true,
    "country": "US",
    "prices": {
      "base_license": { "planId": "base_license", "country": "US", "currency": "USD", "monthly": 29900, "annual": 299000 },
      "professional": { ... },
      "business": { ... }
    }
  }
  ```

## 2. Analyze AI Snapshot
Used by `AiVisionInspector.tsx` on the landing page to run a simulated AI detection demo using Gemini.

- **METHOD:** `POST`
- **PATH:** `/api/analyze-snapshot`
- **REQUEST BODY:** 
  ```json
  {
    "base64Image": "data:image/jpeg;base64,...",
    "cameraName": "Gate Camera",
    "location": "Perimeter Zone"
  }
  ```
- **HEADERS:** `Content-Type: application/json`
- **AUTHENTICATION:** None (Public Demo)
- **EXPECTED RESPONSE:**
  ```json
  {
    "success": true,
    "result": {
      "detectedObjects": ["Person (94% conf)"],
      "summary": "AI detected motion...",
      "threatLevel": "CRITICAL",
      "confidence": 94,
      "zoneBreached": true,
      "whatsappDraft": "⚠️ *SENSA ALERT*...",
      "recommendations": ["Verify live stream"]
    }
  }
  ```

## 3. Send WhatsApp Test
Used by `AiVisionInspector.tsx` and `App.tsx` to simulate a WhatsApp delivery notification for the demo.

- **METHOD:** `POST`
- **PATH:** `/api/send-whatsapp-test`
- **REQUEST BODY:**
  ```json
  {
    "phone": "+1 555 1234",
    "cameraName": "Gate Camera"
  }
  ```
- **HEADERS:** `Content-Type: application/json`
- **AUTHENTICATION:** None (Public Demo)
- **EXPECTED RESPONSE:**
  ```json
  {
    "success": true,
    "status": "DELIVERED",
    "deliveryTimeMs": 1840,
    "recipient": "+1 555 1234",
    "alertId": "WA-ALERT-482912",
    "message": "[SENSA AI] 🚨 Breach on Gate Camera! WhatsApp alert delivered in 1.84 seconds."
  }
  ```
