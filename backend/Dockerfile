FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["Versatile.Api/Versatile.Api.csproj", "Versatile.Api/"]
COPY ["Versatile.Infrastructure/Versatile.Infrastructure.csproj", "Versatile.Infrastructure/"]
COPY ["Versatile.Application/Versatile.Application.csproj", "Versatile.Application/"]
COPY ["Versatile.Domain/Versatile.Domain.csproj", "Versatile.Domain/"]
RUN dotnet restore "Versatile.Api/Versatile.Api.csproj"

COPY . .
# Single publish step (implies restore+build): avoids NETSDK1064 drift where
# a cached --no-restore build disagrees with the earlier restore layer.
RUN dotnet publish "Versatile.Api/Versatile.Api.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
EXPOSE 8080

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

# curl backs the compose HEALTHCHECK (GET /health).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "Versatile.Api.dll"]
