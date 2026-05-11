$ErrorActionPreference = 'Stop'

# Navigate to backend directory (assuming script is run from project root)
$backendPath = Join-Path $PSScriptRoot "backend"
Set-Location $backendPath

# Step 1: Install Python dependencies
Write-Host "Installing Python dependencies..."
python -m pip install --upgrade pip
python -m pip install -r cf-requirements.txt

# Step 2: Create .env from .env.example if it does not exist
$envFile = " .env"
$exampleFile = ".env.example"
if (-Not (Test-Path $envFile)) {
    Write-Host "Creating .env from .env.example..."
    Copy-Item $exampleFile $envFile
    Write-Host "Please edit $envFile and fill in the required environment variables before proceeding."
} else {
    Write-Host ".env already exists. Skipping copy."
}

# Step 3: Start the FastAPI server using uvicorn
Write-Host "Starting FastAPI server..."
python -m uvicorn main:app --host 0.0.0.0 --port 8000
