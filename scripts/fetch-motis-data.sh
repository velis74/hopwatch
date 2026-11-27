#!/usr/bin/env bash
# Downloads the OSM extract and GTFS feeds for MOTIS into motis/data/.
# Sources and licences: motis/README.md.
set -euo pipefail

data_dir="$(cd "$(dirname "$0")/.." && pwd)/motis/data"
mkdir -p "$data_dir/gtfs"

fetch() {
  local url="$1" target="$2"
  echo "Downloading $url"
  curl --fail --location --silent --show-error --retry 3 \
    --output "$target.part" "$url"
  mv "$target.part" "$target"
}

fetch https://download.geofabrik.de/europe/slovenia-latest.osm.pbf "$data_dir/slovenia-latest.osm.pbf"
fetch "https://gitlab.com/api/v4/projects/derp-si%2Fgtfs-generators/packages/generic/IJPP/latest/ijpp_intl_gtfs.zip" \
  "$data_dir/gtfs/ijpp.zip"
fetch https://jbb.ghsq.de/gtfs/si-kranjska-gora.gtfs.zip "$data_dir/gtfs/kranjska-gora.zip"

echo "Done. Import with: docker compose -f motis/docker-compose.yml run --rm motis-import"
