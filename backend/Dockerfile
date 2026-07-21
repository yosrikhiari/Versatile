FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY ["Versatile.Api/Versatile.Api.csproj", "Versatile.Api/"]
COPY ["Versatile.Infrastructure/Versatile.Infrastructure.csproj", "Versatile.Infrastructure/"]
COPY ["Versatile.Application/Versatile.Application.csproj", "Versatile.Application/"]
COPY ["Versatile.Domain/Versatile.Domain.csproj", "Versatile.Domain/"]
RUN dotnet restore "Versatile.Api/Versatile.Api.csproj"

COPY . .
RUN dotnet build "Versatile.Api/Versatile.Api.csproj" -c Release --no-restore

FROM build AS publish
RUN dotnet publish "Versatile.Api/Versatile.Api.csproj" -c Release -o /app/publish --no-build

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
EXPOSE 8080

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

COPY --from=publish /app/publish .

ENTRYPOINT ["dotnet", "Versatile.Api.dll"]
