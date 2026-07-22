using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SparkHistoryItems.Commands;

public record UpdateSparkHistoryItemCommand(Guid Id, string? Type, string? Prompt, string? Blueprint, string? GeneratedContent, Guid? OrganizationId, Guid UserId) : IRequest<SparkHistoryItemDto>, IRequiresOrganization;
