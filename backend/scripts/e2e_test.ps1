# E2E test script for serviio backend
# Registers a customer and provider, logs them in, creates a booking, and verifies handshake

function printErrBody($ex) {
  if ($ex.Response -ne $null) {
    $sr = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
    $body = $sr.ReadToEnd()
    Write-Output $body
  } else {
    Write-Output $ex.Message
  }
}

# Register customer
$customerPayload = @{
  first_name = 'E2E'
  last_name  = 'Customer'
  email      = 'e2e.customer+test@example.com'
  phone      = '01711112222'
  password   = 'Passw0rd!'
  role       = 'customer'
}
try {
  $custBody = $customerPayload | ConvertTo-Json
  $custReg = Invoke-RestMethod -Uri 'http://localhost:5000/api/auth/register' -Method Post -Body $custBody -ContentType 'application/json' -ErrorAction Stop
  Write-Output "CUSTOMER_REGISTER: $($custReg | ConvertTo-Json -Depth 5)"
} catch {
  Write-Output "CUSTOMER_REGISTER_FAILED:"
  printErrBody $_.Exception
}

# Register provider
$providerPayload = @{
  first_name = 'E2E'
  last_name  = 'Provider'
  email      = 'e2e.provider+test@example.com'
  phone      = '01722223333'
  password   = 'Passw0rd!'
  role       = 'provider'
  nid        = '1234567890'
}
try {
  $provBody = $providerPayload | ConvertTo-Json
  $provReg = Invoke-RestMethod -Uri 'http://localhost:5000/api/auth/register' -Method Post -Body $provBody -ContentType 'application/json' -ErrorAction Stop
  Write-Output "PROVIDER_REGISTER: $($provReg | ConvertTo-Json -Depth 5)"
} catch {
  Write-Output "PROVIDER_REGISTER_FAILED:"
  printErrBody $_.Exception
}

Start-Sleep -Seconds 1

# Login customer
try {
  $loginCust = Invoke-RestMethod -Uri 'http://localhost:5000/api/auth/login' -Method Post -Body (@{ email='e2e.customer+test@example.com'; password='Passw0rd!' } | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
  Write-Output "CUSTOMER_LOGIN: $($loginCust | ConvertTo-Json -Depth 5)"
} catch {
  Write-Output "CUSTOMER_LOGIN_FAILED:"
  printErrBody $_.Exception
}

# Login provider
try {
  $loginProv = Invoke-RestMethod -Uri 'http://localhost:5000/api/auth/login' -Method Post -Body (@{ email='e2e.provider+test@example.com'; password='Passw0rd!' } | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
  Write-Output "PROVIDER_LOGIN: $($loginProv | ConvertTo-Json -Depth 5)"
} catch {
  Write-Output "PROVIDER_LOGIN_FAILED:"
  printErrBody $_.Exception
}

# Extract IDs and tokens
$customerId = $null; $providerId = $null; $custToken = $null; $provToken = $null
if ($loginCust -ne $null) { $customerId = $loginCust.user.id; $custToken = $loginCust.token }
if ($loginProv -ne $null) { $providerId = $loginProv.user.id; $provToken = $loginProv.token }
Write-Output "IDS: customer=$customerId provider=$providerId"

if ($customerId -and $providerId) {
  # Create booking
  $bookingPayload = @{
    customer_id = $customerId
    provider_id = $providerId
    service_type = 'Electrician'
    job_location = 'Uttara'
    estimated_price_range = '500-1500'
    is_emergency = $false
  }
  try {
    $bkBody = $bookingPayload | ConvertTo-Json
    $bookingResp = Invoke-RestMethod -Uri 'http://localhost:5000/api/bookings/create' -Method Post -Body $bkBody -ContentType 'application/json' -ErrorAction Stop
    Write-Output "BOOKING_CREATED: $($bookingResp | ConvertTo-Json -Depth 5)"
  } catch {
    Write-Output "BOOKING_CREATE_FAILED:"
    printErrBody $_.Exception
  }

  # Provider fetch bookings
  try {
    $provBookings = Invoke-RestMethod -Uri 'http://localhost:5000/api/bookings/provider' -Method Get -Headers @{ Authorization = "Bearer $provToken" } -ErrorAction Stop
    Write-Output "PROVIDER_BOOKINGS: $($provBookings | ConvertTo-Json -Depth 5)"
  } catch {
    Write-Output "PROVIDER_BOOKINGS_FAILED:"
    printErrBody $_.Exception
  }

  # Verify handshake if booking created
  if ($bookingResp -ne $null -and $bookingResp.handshake_code) {
    $bid = $bookingResp.booking_id
    $code = $bookingResp.handshake_code
    try {
      $verify = Invoke-RestMethod -Uri 'http://localhost:5000/api/bookings/verify-handshake' -Method Post -Headers @{ Authorization = "Bearer $provToken" } -Body (@{ bookingId = $bid; handshakeCode = $code } | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
      Write-Output "VERIFY_RESULT: $($verify | ConvertTo-Json -Depth 5)"
    } catch {
      Write-Output "VERIFY_FAILED:"
      printErrBody $_.Exception
    }
  } else { Write-Output 'NO_BOOKING_TO_VERIFY' }
} else { Write-Output 'SKIPPING_BOOKING_FLOW_DUE_TO_MISSING_IDS' }
