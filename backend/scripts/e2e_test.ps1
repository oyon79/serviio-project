# E2E test script for serviio backend
# Registers a customer and provider, logs them in, creates a booking, and verifies handshake

$BaseUrl = if ($env:SERVIIO_E2E_BASE_URL) { $env:SERVIIO_E2E_BASE_URL.TrimEnd('/') } else { 'http://localhost:5000' }
$PaymentMethod = if ($env:SERVIIO_E2E_PAYMENT_METHOD) { $env:SERVIIO_E2E_PAYMENT_METHOD } else { 'mock' }
$GatewayReference = $env:SERVIIO_E2E_GATEWAY_REFERENCE

function apiUrl($path) {
  return "$BaseUrl$path"
}

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
  $custReg = Invoke-RestMethod -Uri (apiUrl '/api/auth/register') -Method Post -Body $custBody -ContentType 'application/json' -ErrorAction Stop
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
  $provReg = Invoke-RestMethod -Uri (apiUrl '/api/auth/register') -Method Post -Body $provBody -ContentType 'application/json' -ErrorAction Stop
  Write-Output "PROVIDER_REGISTER: $($provReg | ConvertTo-Json -Depth 5)"
} catch {
  Write-Output "PROVIDER_REGISTER_FAILED:"
  printErrBody $_.Exception
}

Start-Sleep -Seconds 1

# Login customer
try {
  $loginCust = Invoke-RestMethod -Uri (apiUrl '/api/auth/login') -Method Post -Body (@{ email='e2e.customer+test@example.com'; password='Passw0rd!' } | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
  Write-Output "CUSTOMER_LOGIN: $($loginCust | ConvertTo-Json -Depth 5)"
} catch {
  Write-Output "CUSTOMER_LOGIN_FAILED:"
  printErrBody $_.Exception
}

# Login seeded verified provider
try {
  $loginProv = Invoke-RestMethod -Uri (apiUrl '/api/auth/login') -Method Post -Body (@{ email='provider@serviio.test'; password='Passw0rd!' } | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
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
    provider_id = $providerId
    service_type = 'Electrician'
    job_location = 'Uttara'
    is_emergency = $false
    booking_date = (Get-Date).AddDays(1).ToString('yyyy-MM-dd HH:mm:ss')
  }
  try {
    $bkBody = $bookingPayload | ConvertTo-Json
    $bookingResp = Invoke-RestMethod -Uri (apiUrl '/api/bookings/create') -Method Post -Headers @{ Authorization = "Bearer $custToken" } -Body $bkBody -ContentType 'application/json' -ErrorAction Stop
    Write-Output "BOOKING_CREATED: $($bookingResp | ConvertTo-Json -Depth 5)"
  } catch {
    Write-Output "BOOKING_CREATE_FAILED:"
    printErrBody $_.Exception
  }

  # Provider fetch bookings
  try {
    $provBookings = Invoke-RestMethod -Uri (apiUrl '/api/bookings/provider') -Method Get -Headers @{ Authorization = "Bearer $provToken" } -ErrorAction Stop
    Write-Output "PROVIDER_BOOKINGS: $($provBookings | ConvertTo-Json -Depth 5)"
  } catch {
    Write-Output "PROVIDER_BOOKINGS_FAILED:"
    printErrBody $_.Exception
  }

  # Pay, fetch customer-visible handshake code, then verify
  if ($bookingResp -ne $null -and $bookingResp.data.booking_id) {
    $bid = $bookingResp.data.booking_id
    $amount = $bookingResp.data.quoted_amount
    try {
      $paymentPayload = @{
        booking_id = $bid
        amount = $amount
        payment_method = $PaymentMethod
      }
      if ($GatewayReference) {
        $paymentPayload.gateway_reference = $GatewayReference
      }
      $pay = Invoke-RestMethod -Uri (apiUrl '/api/payments/process') -Method Post -Headers @{ Authorization = "Bearer $custToken" } -Body ($paymentPayload | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
      Write-Output "PAYMENT_RESULT: $($pay | ConvertTo-Json -Depth 5)"
    } catch {
      Write-Output "PAYMENT_FAILED:"
      printErrBody $_.Exception
    }

    try {
      $bookingDetails = Invoke-RestMethod -Uri (apiUrl "/api/bookings/$bid") -Method Get -Headers @{ Authorization = "Bearer $custToken" } -ErrorAction Stop
      $code = $bookingDetails.data.handshake_code
      Write-Output "HANDSHAKE_CODE_FETCHED: $code"
    } catch {
      Write-Output "HANDSHAKE_FETCH_FAILED:"
      printErrBody $_.Exception
    }

    if ($code) {
    try {
      $verify = Invoke-RestMethod -Uri (apiUrl '/api/bookings/verify-handshake') -Method Post -Headers @{ Authorization = "Bearer $provToken" } -Body (@{ bookingId = $bid; handshakeCode = $code } | ConvertTo-Json) -ContentType 'application/json' -ErrorAction Stop
      Write-Output "VERIFY_RESULT: $($verify | ConvertTo-Json -Depth 5)"
    } catch {
      Write-Output "VERIFY_FAILED:"
      printErrBody $_.Exception
    }
    } else { Write-Output 'NO_HANDSHAKE_CODE_TO_VERIFY' }
  } else { Write-Output 'NO_BOOKING_TO_VERIFY' }
} else { Write-Output 'SKIPPING_BOOKING_FLOW_DUE_TO_MISSING_IDS' }
