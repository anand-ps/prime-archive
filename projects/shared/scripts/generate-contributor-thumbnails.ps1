$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$ContributorsRoot = Join-Path $RepoRoot 'projects\shared\assets\images\contributors'
$InlineRoot = Join-Path $ContributorsRoot 'inline'
$ContributorsDataPath = Join-Path $RepoRoot 'projects\shared\data\contributors.json'
$InlineSize = 160
$JpegQuality = 82L
$SupportedExtensions = @('.jpg', '.jpeg', '.png', '.bmp')

if (!(Test-Path -LiteralPath $InlineRoot)) {
    New-Item -ItemType Directory -Path $InlineRoot | Out-Null
}

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' } |
    Select-Object -First 1

$encoder = [System.Drawing.Imaging.Encoder]::Quality
$encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters 1
$encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, $JpegQuality)

$contributorsJson = Get-Content -Path $ContributorsDataPath -Raw | ConvertFrom-Json
$contributorsBySource = @{}

$contributorsJson.contributors.PSObject.Properties | ForEach-Object {
    $contributor = $_.Value
    if ($null -ne $contributor.photo -and $contributor.photo -ne '') {
        $normalizedPhoto = ($contributor.photo -replace '^/', '') -replace '/', '\'
        $fullPhotoPath = Join-Path $RepoRoot $normalizedPhoto
        $contributorsBySource[$fullPhotoPath.ToLowerInvariant()] = $contributor
    }
}

Get-ChildItem -Path $ContributorsRoot -File | Where-Object {
    $SupportedExtensions -contains $_.Extension.ToLowerInvariant()
} | ForEach-Object {
    $sourcePath = $_.FullName
    $destinationPath = Join-Path $InlineRoot ($_.BaseName + '.jpg')
    $contributor = $contributorsBySource[$sourcePath.ToLowerInvariant()]

    $sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
    try {
        $bitmap = New-Object System.Drawing.Bitmap $InlineSize, $InlineSize
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $graphics.Clear([System.Drawing.Color]::White)

                $focusX = 50.0
                $focusY = 50.0
                $zoom = 1.0

                if ($null -ne $contributor) {
                    if ($null -ne $contributor.focus) {
                        if ($null -ne $contributor.focus.x) { $focusX = [double]$contributor.focus.x }
                        if ($null -ne $contributor.focus.y) { $focusY = [double]$contributor.focus.y }
                    }
                    if ($null -ne $contributor.zoom) {
                        $zoom = [Math]::Max([double]$contributor.zoom, 1.0)
                    }
                }

                $coverScale = [Math]::Max($InlineSize / [double]$sourceImage.Width, $InlineSize / [double]$sourceImage.Height)
                $visibleSourceSize = $InlineSize / ($coverScale * $zoom)
                $visibleSourceSize = [Math]::Max(1.0, [Math]::Min($visibleSourceSize, [Math]::Min($sourceImage.Width, $sourceImage.Height)))

                $maxCropX = [Math]::Max(0.0, [double]$sourceImage.Width - $visibleSourceSize)
                $maxCropY = [Math]::Max(0.0, [double]$sourceImage.Height - $visibleSourceSize)

                $cropX = ($focusX / 100.0) * $maxCropX
                $cropY = ($focusY / 100.0) * $maxCropY

                $cropX = [Math]::Max(0.0, [Math]::Min($cropX, $maxCropX))
                $cropY = [Math]::Max(0.0, [Math]::Min($cropY, $maxCropY))

                $sourceRect = New-Object System.Drawing.RectangleF([single]$cropX, [single]$cropY, [single]$visibleSourceSize, [single]$visibleSourceSize)
                $destRect = New-Object System.Drawing.RectangleF(0, 0, $InlineSize, $InlineSize)

                $graphics.DrawImage($sourceImage, $destRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
            } finally {
                $graphics.Dispose()
            }

            $bitmap.Save($destinationPath, $jpegCodec, $encoderParameters)
            Write-Output ("Updated " + $destinationPath.Replace($RepoRoot + '\', ''))
        } finally {
            $bitmap.Dispose()
        }
    } finally {
        $sourceImage.Dispose()
    }
}
